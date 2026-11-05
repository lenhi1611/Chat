import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import type { ChatError } from '@realtime-chat/chat-data-access';
import { MAX_TEXT_LENGTH } from '@realtime-chat/contracts';
import { ZardButtonComponent } from '@realtime-chat/ui';

const MESSAGES: Record<ChatError['code'], string> = {
  NOT_CONNECTED: 'Not connected to the server: the message was not sent.',
  MESSAGE_TOO_LONG: `Message is too long (max ${MAX_TEXT_LENGTH} characters).`,
  INVALID_PAYLOAD: 'Invalid message.',
  UNKNOWN_EVENT: 'The server did not understand the request.',
  NOT_A_MEMBER: 'You are not a member of this conversation.',
  SEND_FAILED: 'The message could not be sent. Please try again.',
};

/** Last chat error (server or local) with a dismiss button. */
@Component({
  selector: 'chat-error-notice',
  imports: [ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
      data-testid="chat-error"
      [attr.data-code]="error().code"
    >
      <span>{{ text() }}</span>
      <button
        z-button
        zType="ghost"
        zSize="sm"
        type="button"
        data-testid="chat-error-dismiss"
        (click)="dismiss.emit()"
      >
        Dismiss
      </button>
    </div>
  `,
})
export class ChatErrorNotice {
  readonly error = input.required<ChatError>();
  readonly dismiss = output();

  protected readonly text = computed(
    () => MESSAGES[this.error().code] ?? this.error().message,
  );
}
