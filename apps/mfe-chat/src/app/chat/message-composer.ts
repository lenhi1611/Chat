import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { MAX_TEXT_LENGTH } from '@realtime-chat/contracts';
import { ZardButtonComponent, ZardInputComponent } from '@realtime-chat/ui';

/** Show the character counter once the draft gets this close to the limit. */
const COUNTER_FROM = MAX_TEXT_LENGTH - 200;

/**
 * Single-line message input. Enter (form submit) sends. Emits the trimmed
 * text and clears itself; it does not talk to the store.
 */
@Component({
  selector: 'chat-message-composer',
  imports: [ZardInputComponent, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form
      class="flex items-start gap-2"
      data-testid="composer"
      (submit)="submit($event)"
    >
      <div class="flex flex-1 flex-col gap-1">
        <input
          z-input
          type="text"
          name="message"
          autocomplete="off"
          placeholder="Type a message…"
          aria-label="Message"
          data-testid="composer-input"
          [value]="draft()"
          (valueChange)="draft.set($event?.toString() ?? '')"
          [attr.aria-invalid]="tooLong() || null"
        />
        @if (showCounter()) {
          <span
            class="text-xs"
            [class.text-destructive]="tooLong()"
            [class.text-muted-foreground]="!tooLong()"
            data-testid="composer-counter"
            >{{ length() }}/{{ max }}</span
          >
        }
      </div>
      <button
        z-button
        type="submit"
        data-testid="composer-send"
        [zDisabled]="!canSend()"
      >
        Send
      </button>
    </form>
  `,
})
export class MessageComposer {
  /** False while the socket is not open: typing is allowed, sending is not. */
  readonly enabled = input(true);
  readonly send = output<string>();

  protected readonly max = MAX_TEXT_LENGTH;
  protected readonly draft = signal('');
  protected readonly length = computed(() => this.draft().trim().length);
  protected readonly tooLong = computed(() => this.length() > MAX_TEXT_LENGTH);
  protected readonly showCounter = computed(
    () => this.length() >= COUNTER_FROM,
  );
  protected readonly canSend = computed(
    () => this.enabled() && this.length() > 0 && !this.tooLong(),
  );

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.canSend()) return;
    this.send.emit(this.draft().trim());
    this.draft.set('');
  }
}
