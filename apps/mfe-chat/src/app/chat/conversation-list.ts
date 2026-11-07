import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import type { Conversation } from '@realtime-chat/chat-data-access';
import { ZardAvatarComponent } from '@realtime-chat/ui';
import {
  conversationTitle,
  initials,
  lastMessagePreview,
} from './conversation-display';

/** Conversations, most recent activity first; links to each one. */
@Component({
  selector: 'chat-conversation-list',
  imports: [RouterLink, RouterLinkActive, DatePipe, ZardAvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav aria-label="Conversations" class="min-h-0 flex-1 overflow-y-auto">
      <ul class="flex flex-col p-2" data-testid="conversation-list">
        @for (conversation of conversations(); track conversation.id) {
          <li>
            <a
              [routerLink]="[conversation.id]"
              routerLinkActive="bg-muted"
              ariaCurrentWhenActive="page"
              class="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              data-testid="conversation-item"
              [attr.data-conversation-id]="conversation.id"
            >
              <z-avatar
                [zFallback]="initialsOf(conversation)"
                [zAlt]="titleOf(conversation)"
              />
              <span class="flex min-w-0 flex-1 flex-col">
                <span class="flex items-baseline justify-between gap-2">
                  <span
                    class="truncate text-sm font-medium"
                    data-testid="conversation-title"
                    >{{ titleOf(conversation) }}</span
                  >
                  @if (conversation.lastMessage; as last) {
                    <time
                      class="shrink-0 text-xs text-muted-foreground"
                      [attr.datetime]="last.sentAt"
                      >{{ last.sentAt | date: dateFormat(last.sentAt) }}</time
                    >
                  }
                </span>
                <span
                  class="truncate text-xs text-muted-foreground"
                  data-testid="conversation-preview"
                  >{{ previewOf(conversation) }}</span
                >
              </span>
            </a>
          </li>
        } @empty {
          <li
            class="px-2 py-6 text-center text-sm text-muted-foreground"
            data-testid="conversations-empty"
          >
            {{
              loading()
                ? 'Loading conversations…'
                : 'No conversations yet. Start one with “New”.'
            }}
          </li>
        }
      </ul>
    </nav>
  `,
})
export class ConversationList {
  readonly conversations = input.required<readonly Conversation[]>();
  readonly myId = input<string | null>(null);
  readonly loading = input(false);

  protected titleOf(conversation: Conversation): string {
    return conversationTitle(conversation, this.myId());
  }

  protected initialsOf(conversation: Conversation): string {
    return initials(this.titleOf(conversation));
  }

  protected previewOf(conversation: Conversation): string {
    return lastMessagePreview(conversation, this.myId());
  }

  /** Time for today's messages, the date otherwise. */
  protected dateFormat(iso: string): string {
    return new Date(iso).toDateString() === new Date().toDateString()
      ? 'HH:mm'
      : 'MMM d';
  }
}
