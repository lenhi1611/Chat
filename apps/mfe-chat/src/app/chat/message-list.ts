import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { ChatMessage } from '@realtime-chat/chat-data-access';
import { ZardButtonComponent } from '@realtime-chat/ui';
import { MessageBubble } from './message-bubble';

/** Distance (px) from the bottom under which the list counts as "at the bottom". */
export const STICK_THRESHOLD_PX = 48;
/** Distance (px) from the top under which older messages are requested. */
export const LOAD_OLDER_THRESHOLD_PX = 120;

/** A message the user is looking at, and its distance from the viewport top. */
interface ScrollAnchor {
  id: string;
  offset: number;
}

/** What was on screen after the previous render. */
interface Rendered {
  firstId: string | null;
  lastId: string | null;
  scrollHeight: number;
}

const NOTHING_RENDERED: Rendered = {
  firstId: null,
  lastId: null,
  scrollHeight: 0,
};

/**
 * Scrollable message list:
 * - at the bottom (or after sending your own message): follows new messages;
 * - scrolled up to read history: stays put and counts unread messages behind
 *   a "New messages" button that jumps back down;
 * - near the top: asks for older messages (`loadOlder`); when they are
 *   prepended, the messages being read stay exactly where they were.
 *
 * Rendering one conversation only: the parent re-creates the list when the
 * conversation changes.
 */
@Component({
  selector: 'chat-message-list',
  imports: [MessageBubble, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative flex min-h-0 flex-1 flex-col' },
  template: `
    <!-- overflow-anchor: none: the position is kept by hand on prepend, the
         browser's own scroll anchoring would apply the correction twice. -->
    <div
      #viewport
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [overflow-anchor:none]"
      role="log"
      aria-live="polite"
      aria-label="Messages"
      data-testid="message-list"
      (scroll)="onScroll()"
    >
      @if (failed()) {
        <p
          class="flex items-center justify-center gap-2 text-xs text-destructive"
          data-testid="history-error"
        >
          Couldn't load messages.
          <button
            z-button
            zType="outline"
            zSize="xs"
            type="button"
            data-testid="history-retry"
            (click)="loadOlder.emit()"
          >
            Retry
          </button>
        </p>
      } @else if (!hasOlder() && messages().length > 0) {
        <p
          class="text-center text-xs text-muted-foreground"
          data-testid="history-start"
        >
          This is the beginning of the conversation.
        </p>
      }
      @for (message of messages(); track message.id) {
        <chat-message-bubble
          [attr.data-message-id]="message.id"
          [message]="message"
          [own]="isOwn()(message)"
          [senderName]="senderName()(message)"
        />
      } @empty {
        @if (!loadingOlder() && !failed()) {
          <p
            class="m-auto text-sm text-muted-foreground"
            data-testid="empty-state"
          >
            No messages yet. Say hello!
          </p>
        }
      }
    </div>
    <!-- Floating, not in the list: a banner in the flow would push the
         messages down while loading, then up again once they arrive. -->
    @if (loadingOlder()) {
      <p
        class="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm"
        role="status"
        data-testid="loading-older"
      >
        Loading earlier messages…
      </p>
    }
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
  /** Ascending by `seq`. */
  readonly messages = input.required<readonly ChatMessage[]>();
  readonly isOwn = input<(message: ChatMessage) => boolean>(() => false);
  readonly senderName = input<(message: ChatMessage) => string>(() => '');
  /** Older messages exist on the server (or the first page is not in yet). */
  readonly hasOlder = input(false);
  readonly loadingOlder = input(false);
  /** The last history request failed: no automatic retry, a button instead. */
  readonly failed = input(false);
  readonly loadOlder = output();

  /** New messages that arrived while the user was scrolled up. */
  protected readonly unread = signal(0);

  private readonly viewport =
    viewChild.required<ElementRef<HTMLElement>>('viewport');
  private atBottom = true;
  private rendered: Rendered = NOTHING_RENDERED;
  /** Taken when the user scrolls; restored after older messages arrive. */
  private anchor: ScrollAnchor | null = null;

  constructor() {
    // Runs after the DOM shows the new messages, so scrollHeight is final.
    afterRenderEffect(() => {
      const messages = this.messages();
      untracked(() => this.afterMessagesRendered(messages));
    });

    // A short history that does not fill the viewport cannot be scrolled up:
    // keep loading until it does or the start is reached.
    afterRenderEffect(() => {
      const wanted =
        this.messages().length > 0 &&
        this.hasOlder() &&
        !this.loadingOlder() &&
        !this.failed();
      if (!wanted) return;
      const el = this.viewport().nativeElement;
      if (el.scrollHeight <= el.clientHeight) this.loadOlder.emit();
    });
  }

  private afterMessagesRendered(messages: readonly ChatMessage[]): void {
    const el = this.viewport().nativeElement;
    const previous = this.rendered;
    const last = messages.at(-1);
    this.rendered = {
      firstId: messages[0]?.id ?? null,
      lastId: last?.id ?? null,
      scrollHeight: el.scrollHeight,
    };
    if (!last) return;

    const previousLastIndex = lastIndexOf(messages, previous.lastId);

    // First messages, or a different run (history replaced after a gap):
    // start at the bottom, like opening the conversation.
    if (previousLastIndex === -1) {
      this.scrollToBottom();
      return;
    }

    // Older messages prepended: the message being read goes back to where it
    // was on screen. Banners above it (loading…, start of history) may have
    // changed in between, so this is measured on the message itself; the
    // height difference is only a fallback (never scrolled, e.g. auto-fill).
    if (messages[0].id !== previous.firstId) {
      const anchored = this.anchor && this.messageElement(this.anchor.id);
      if (this.anchor && anchored) {
        el.scrollTop += this.offsetOf(anchored) - this.anchor.offset;
      } else {
        el.scrollTop += el.scrollHeight - previous.scrollHeight;
      }
      this.rendered = { ...this.rendered, scrollHeight: el.scrollHeight };
    }

    const added = messages.length - 1 - previousLastIndex;
    if (added <= 0) return;
    if (this.atBottom || this.isOwn()(last)) {
      this.scrollToBottom();
    } else {
      this.unread.update((n) => n + added);
    }
  }

  protected onScroll(): void {
    const el = this.viewport().nativeElement;
    this.atBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
    if (this.atBottom) this.unread.set(0);
    this.anchor = this.findAnchor();
    if (
      el.scrollTop <= LOAD_OLDER_THRESHOLD_PX &&
      this.hasOlder() &&
      !this.loadingOlder() &&
      !this.failed()
    ) {
      this.loadOlder.emit();
    }
  }

  /** The first message whose bottom is inside the viewport. */
  private findAnchor(): ScrollAnchor | null {
    const top = this.viewport().nativeElement.getBoundingClientRect().top;
    const items =
      this.viewport().nativeElement.querySelectorAll<HTMLElement>(
        '[data-message-id]',
      );
    for (const item of items) {
      if (item.getBoundingClientRect().bottom > top) {
        return {
          id: item.dataset['messageId'] ?? '',
          offset: this.offsetOf(item),
        };
      }
    }
    return null;
  }

  private offsetOf(item: HTMLElement): number {
    return (
      item.getBoundingClientRect().top -
      this.viewport().nativeElement.getBoundingClientRect().top
    );
  }

  private messageElement(id: string): HTMLElement | null {
    return this.viewport().nativeElement.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(id)}"]`,
    );
  }

  scrollToBottom(): void {
    const el = this.viewport().nativeElement;
    el.scrollTop = el.scrollHeight;
    this.atBottom = true;
    this.unread.set(0);
    this.rendered = { ...this.rendered, scrollHeight: el.scrollHeight };
  }
}

/** Index of the message with this id, searching from the end (usual case). */
function lastIndexOf(messages: readonly ChatMessage[], id: string | null) {
  if (id === null) return -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].id === id) return i;
  }
  return -1;
}
