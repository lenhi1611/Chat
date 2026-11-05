import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import {
  ChatActions,
  selectIsConnected,
  selectIsOwnMessage,
  selectLastError,
  selectMessages,
} from '@realtime-chat/chat-data-access';
import { ZardCardImports } from '@realtime-chat/ui';
import { ChatErrorNotice } from './chat-error-notice';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';

/**
 * Smart component of the chat MFE. Talks only to the (shell-owned) Store:
 * reads selectors, dispatches actions. It never touches the WebSocket.
 */
@Component({
  selector: 'chat-page',
  imports: [ZardCardImports, MessageList, MessageComposer, ChatErrorNotice],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-card class="h-[70vh] min-h-96 gap-0" data-testid="chat-page">
      <z-card-header class="border-b">
        <z-card-title zTitle="Lobby" />
        <z-card-description
          zDescription="Everyone on this page sees each other's messages."
        />
      </z-card-header>
      <chat-message-list [messages]="messages()" [isOwn]="isOwn()" />
      <z-card-footer class="flex-col items-stretch gap-2 border-t">
        @if (lastError(); as error) {
          <chat-error-notice [error]="error" (dismiss)="dismissError()" />
        }
        @if (!isConnected()) {
          <p class="text-xs text-muted-foreground" data-testid="offline-hint">
            Waiting for the server… You can keep typing; Send turns on once the
            connection is back.
          </p>
        }
        <p class="text-xs text-muted-foreground" data-testid="upgrade-notice">
          Sending is paused while chat moves to accounts and conversations.
        </p>
        <!-- Re-enabled with a selected conversation in phase 2, step 10. -->
        <chat-message-composer [enabled]="false" />
      </z-card-footer>
    </z-card>
  `,
})
export class ChatPage {
  private readonly store = inject(Store);

  protected readonly messages = this.store.selectSignal(selectMessages);
  protected readonly isOwn = this.store.selectSignal(selectIsOwnMessage);
  protected readonly isConnected = this.store.selectSignal(selectIsConnected);
  protected readonly lastError = this.store.selectSignal(selectLastError);

  protected dismissError(): void {
    this.store.dispatch(ChatActions.errorDismissed());
  }
}
