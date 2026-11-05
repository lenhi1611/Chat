import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import type { ChatMessage } from '@realtime-chat/chat-data-access';

/**
 * One message. Own messages are right-aligned and labelled "You".
 * The text is bound with [textContent]: whitespace is kept exactly as sent
 * (pre-wrap) and template formatting cannot add any.
 */
@Component({
  selector: 'chat-message-bubble',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'flex flex-col gap-1',
    '[class.items-end]': 'own()',
    '[class.items-start]': '!own()',
    'data-testid': 'message',
    '[attr.data-own]': 'own()',
  },
  template: `
    <span class="px-1 text-xs text-muted-foreground">
      <span data-testid="message-sender">{{
        own() ? 'You' : senderLabel()
      }}</span>
      ·
      <time [attr.datetime]="message().sentAt">{{
        message().sentAt | date: 'HH:mm'
      }}</time>
    </span>
    <p
      class="max-w-[75%] rounded-2xl px-3 py-2 text-sm wrap-break-word whitespace-pre-wrap"
      [class]="
        own()
          ? 'bg-primary text-primary-foreground'
          : 'bg-muted text-foreground'
      "
      data-testid="message-text"
      [textContent]="message().text"
    ></p>
  `,
})
export class MessageBubble {
  readonly message = input.required<ChatMessage>();
  readonly own = input(false);

  /**
   * Protocol v2 sends only the sender's id; names come from the conversation
   * members once conversations reach the UI (phase 2, step 10).
   */
  protected readonly senderLabel = computed(
    () => `User ${this.message().senderId.slice(0, 8)}`,
  );
}
