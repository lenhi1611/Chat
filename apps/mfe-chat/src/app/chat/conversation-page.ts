import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@realtime-chat/auth';
import {
  ChatActions,
  type ChatMessage,
  ConversationsActions,
  MessagesActions,
  selectConversationsLoaded,
  selectIsConnected,
  selectLastError,
  selectSelectedConversation,
  selectSelectedHistoryView,
  selectSelectedMessages,
} from '@realtime-chat/chat-data-access';
import { ZardAvatarComponent, ZardButtonComponent } from '@realtime-chat/ui';
import { ChatErrorNotice } from './chat-error-notice';
import {
  conversationSubtitle,
  conversationTitle,
  initials,
  senderNames,
} from './conversation-display';
import { MessageComposer } from './message-composer';
import { MessageList } from './message-list';

/**
 * One conversation (route `:conversationId`): header, history and composer.
 * Talks only to the Store; selecting the conversation loads its history.
 */
@Component({
  selector: 'chat-conversation-page',
  imports: [
    RouterLink,
    ZardAvatarComponent,
    ZardButtonComponent,
    MessageList,
    MessageComposer,
    ChatErrorNotice,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <header class="flex items-center gap-3 border-b px-4 py-3">
      <a
        z-button
        zType="ghost"
        zSize="sm"
        routerLink=".."
        class="md:hidden"
        data-testid="back-to-list"
        aria-label="Back to conversations"
        >←</a
      >
      @if (conversation(); as current) {
        <z-avatar [zFallback]="avatarText()" [zAlt]="title()" />
        <div class="flex min-w-0 flex-col">
          <h2
            class="truncate text-sm font-semibold"
            data-testid="conversation-heading"
          >
            {{ title() }}
          </h2>
          <span class="truncate text-xs text-muted-foreground">{{
            subtitle()
          }}</span>
        </div>
      } @else {
        <h2 class="text-sm font-semibold text-muted-foreground">
          {{ listLoaded() ? 'Conversation not found' : 'Loading…' }}
        </h2>
      }
    </header>

    <!-- One block per conversation: switching re-creates the list (scroll
         position, unread count) and the composer (draft). -->
    @for (id of [conversationId()]; track id) {
      @if (notFound()) {
        <p
          class="m-auto max-w-xs p-6 text-center text-sm text-muted-foreground"
          data-testid="conversation-not-found"
        >
          This conversation does not exist or you are not one of its members.
        </p>
      } @else {
        <chat-message-list
          [messages]="messages()"
          [isOwn]="isOwn()"
          [senderName]="senderName()"
          [hasOlder]="history().hasOlder"
          [loadingOlder]="history().loading"
          [failed]="history().error !== null"
          (loadOlder)="loadOlder(id)"
        />
        <footer class="flex flex-col gap-2 border-t p-4">
          @if (lastError(); as error) {
            <chat-error-notice [error]="error" (dismiss)="dismissError()" />
          }
          @if (!isConnected()) {
            <p class="text-xs text-muted-foreground" data-testid="offline-hint">
              Waiting for the server… You can keep typing; Send turns on once
              the connection is back.
            </p>
          }
          <chat-message-composer
            [enabled]="isConnected() && conversation() !== null"
            (send)="send(id, $event)"
          />
        </footer>
      }
    }
  `,
})
export class ConversationPage {
  private readonly store = inject(Store);

  /** Route parameter (component input binding). */
  readonly conversationId = input.required<string>();

  private readonly me = this.store.selectSignal(selectCurrentUser);
  protected readonly conversation = this.store.selectSignal(
    selectSelectedConversation,
  );
  protected readonly messages = this.store.selectSignal(selectSelectedMessages);
  protected readonly history = this.store.selectSignal(
    selectSelectedHistoryView,
  );
  protected readonly listLoaded = this.store.selectSignal(
    selectConversationsLoaded,
  );
  protected readonly isConnected = this.store.selectSignal(selectIsConnected);
  protected readonly lastError = this.store.selectSignal(selectLastError);

  private readonly myId = computed(() => this.me()?.id ?? null);
  protected readonly title = computed(() => {
    const current = this.conversation();
    return current ? conversationTitle(current, this.myId()) : '';
  });
  protected readonly subtitle = computed(() => {
    const current = this.conversation();
    return current ? conversationSubtitle(current, this.myId()) : '';
  });
  protected readonly avatarText = computed(() => initials(this.title()));
  protected readonly isOwn = computed(() => {
    const myId = this.myId();
    return (message: ChatMessage) => message.senderId === myId;
  });
  protected readonly senderName = computed(() =>
    senderNames(this.conversation()),
  );
  /**
   * Not in the (loaded) list, and the server refused its history: a wrong
   * link, or not a member. A conversation created a moment ago is in the
   * list already (create/push), so it is never mistaken for this.
   */
  protected readonly notFound = computed(() => {
    const code = this.history().error?.code;
    return (
      this.listLoaded() &&
      this.conversation() === null &&
      // VALIDATION_FAILED: the id in the URL is not even a UUID.
      (code === 'NOT_FOUND' || code === 'VALIDATION_FAILED')
    );
  });

  constructor() {
    effect(() => {
      const conversationId = this.conversationId();
      untracked(() => {
        this.store.dispatch(ConversationsActions.selected({ conversationId }));
        // An error about the previous conversation means nothing here.
        this.store.dispatch(ChatActions.errorDismissed());
      });
    });
    inject(DestroyRef).onDestroy(() =>
      this.store.dispatch(
        ConversationsActions.selected({ conversationId: null }),
      ),
    );
  }

  protected loadOlder(conversationId: string): void {
    this.store.dispatch(MessagesActions.olderRequested({ conversationId }));
  }

  protected send(conversationId: string, text: string): void {
    this.store.dispatch(ChatActions.sendMessage({ conversationId, text }));
  }

  protected dismissError(): void {
    this.store.dispatch(ChatActions.errorDismissed());
  }
}
