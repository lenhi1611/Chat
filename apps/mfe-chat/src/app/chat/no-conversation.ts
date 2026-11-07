import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Right column when no conversation is open (wide screens only). */
@Component({
  selector: 'chat-no-conversation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-1 items-center justify-center p-6' },
  template: `
    <p
      class="max-w-xs text-center text-sm text-muted-foreground"
      data-testid="no-conversation"
    >
      Select a conversation, or start a new one with “New”.
    </p>
  `,
})
export class NoConversation {}
