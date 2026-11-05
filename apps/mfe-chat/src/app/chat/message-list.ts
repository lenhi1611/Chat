import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ChatMessage } from '@realtime-chat/chat-data-access';
import { ZardButtonComponent } from '@realtime-chat/ui';
import { MessageBubble } from './message-bubble';

/** Distance (px) from the bottom under which the list counts as "at the bottom". */
export const STICK_THRESHOLD_PX = 48;

/**
 * Scrollable message list with "stick to bottom" behaviour:
 * - at the bottom (or after sending your own message): follows new messages;
 * - scrolled up to read history: stays put and counts unread messages behind
 *   a "New messages" button that jumps back down.
 */
@Component({
  selector: 'chat-message-list',
  imports: [MessageBubble, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex min-h-0 flex-1 flex-col' },
  template: `
    <div
      #viewport
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
      role="log"
      aria-live="polite"
      aria-label="Messages"
      data-testid="message-list"
      (scroll)="onScroll()"
    >
      @for (message of messages(); track message.id) {
        <chat-message-bubble [message]="message" [own]="isOwn()(message)" />
      } @empty {
        <p
          class="m-auto text-sm text-muted-foreground"
          data-testid="empty-state"
        >
          No messages yet. Say hello!
        </p>
      }
    </div>
    @if (unread() > 0) {
      <button
        z-button
        zSize="sm"
        class="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md"
        data-testid="new-messages"
        (click)="scrollToBottom()"
      >
        New messages ({{ unread() }})
      </button>
    }
  `,
})
export class MessageList {
  readonly messages = input.required<readonly ChatMessage[]>();
  readonly isOwn = input<(message: ChatMessage) => boolean>(() => false);

  /** New messages that arrived while the user was scrolled up. */
  protected readonly unread = signal(0);

  private readonly viewport =
    viewChild.required<ElementRef<HTMLElement>>('viewport');
  private atBottom = true;
  private renderedCount = 0;

  constructor() {
    // Runs after the DOM shows the new messages, so scrollHeight is final.
    afterRenderEffect(() => {
      const messages = this.messages();
      const added = messages.length - this.renderedCount;
      this.renderedCount = messages.length;
      if (added <= 0) return;

      const ownLast = untracked(this.isOwn)(messages[messages.length - 1]);
      if (this.atBottom || ownLast) {
        this.scrollToBottom();
      } else {
        this.unread.update((n) => n + added);
      }
    });
  }

  protected onScroll(): void {
    const el = this.viewport().nativeElement;
    this.atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    if (this.atBottom) this.unread.set(0);
  }

  scrollToBottom(): void {
    const el = this.viewport().nativeElement;
    el.scrollTop = el.scrollHeight;
    this.atBottom = true;
    this.unread.set(0);
  }
}
