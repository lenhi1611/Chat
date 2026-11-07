import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { Actions, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { selectCurrentUser } from '@realtime-chat/auth';
import {
  ConversationsActions,
  selectConversations,
  selectConversationsError,
  selectConversationsLoading,
  selectCreateConversationError,
  selectCreatingConversation,
  selectSelectedConversationId,
} from '@realtime-chat/chat-data-access';
import type { CreateConversationRequest } from '@realtime-chat/contracts';
import { ZardButtonComponent } from '@realtime-chat/ui';
import { ConversationList } from './conversation-list';
import { NewConversationDialog } from './new-conversation-dialog';

/**
 * Two columns: conversations on the left, the open one (child route) on the
 * right. On narrow screens only one shows: the list, or the open conversation
 * (with a back link).
 */
@Component({
  selector: 'chat-layout',
  imports: [
    RouterOutlet,
    ZardButtonComponent,
    ConversationList,
    NewConversationDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="flex h-[calc(100dvh-7.5rem)] min-h-[28rem] overflow-hidden rounded-xl border bg-card"
      data-testid="chat-layout"
    >
      <aside
        class="min-h-0 w-full flex-col border-e md:flex md:w-80 md:shrink-0"
        [class.hidden]="hasSelection()"
        [class.flex]="!hasSelection()"
        aria-label="Conversations"
      >
        <div class="flex items-center justify-between border-b px-4 py-3">
          <h1 class="text-sm font-semibold">Chats</h1>
          <button
            z-button
            zSize="sm"
            type="button"
            data-testid="new-conversation"
            (click)="dialogOpen.set(true)"
          >
            New
          </button>
        </div>
        @if (listError(); as error) {
          <p
            class="flex items-center justify-between gap-2 border-b px-4 py-2 text-xs text-destructive"
            role="alert"
            data-testid="conversations-error"
          >
            {{ error.message }}
            <button
              z-button
              zType="outline"
              zSize="xs"
              type="button"
              (click)="reload()"
            >
              Retry
            </button>
          </p>
        }
        <chat-conversation-list
          [conversations]="conversations()"
          [myId]="myId()"
          [loading]="loading()"
        />
      </aside>
      <section
        class="min-h-0 min-w-0 flex-1 flex-col md:flex"
        [class.hidden]="!hasSelection()"
        [class.flex]="hasSelection()"
      >
        <router-outlet />
      </section>
    </div>

    <chat-new-conversation-dialog
      [(open)]="dialogOpen"
      [pending]="creating()"
      [createError]="createError()"
      (create)="create($event)"
    />
  `,
})
export class ChatLayout {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly conversations =
    this.store.selectSignal(selectConversations);
  protected readonly loading = this.store.selectSignal(
    selectConversationsLoading,
  );
  protected readonly listError = this.store.selectSignal(
    selectConversationsError,
  );
  protected readonly creating = this.store.selectSignal(
    selectCreatingConversation,
  );
  protected readonly createError = this.store.selectSignal(
    selectCreateConversationError,
  );
  private readonly selectedId = this.store.selectSignal(
    selectSelectedConversationId,
  );
  private readonly me = this.store.selectSignal(selectCurrentUser);

  protected readonly myId = computed(() => this.me()?.id ?? null);
  protected readonly hasSelection = computed(() => this.selectedId() !== null);
  protected readonly dialogOpen = signal(false);

  constructor() {
    // Created (or the DM already existed): open it. Only while the dialog is
    // open, so a create from elsewhere never navigates this page.
    inject(Actions)
      .pipe(ofType(ConversationsActions.createSucceeded), takeUntilDestroyed())
      .subscribe(({ conversation }) => {
        if (!this.dialogOpen()) return;
        this.dialogOpen.set(false);
        void this.router.navigate([conversation.id], {
          relativeTo: this.route,
        });
      });
  }

  protected create(request: CreateConversationRequest): void {
    this.store.dispatch(ConversationsActions.create({ request }));
  }

  protected reload(): void {
    this.store.dispatch(ConversationsActions.load());
  }
}
