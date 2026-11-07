import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import {
  type RequestError,
  UserDirectory,
} from '@realtime-chat/chat-data-access';
import {
  type CreateConversationRequest,
  GROUP_MAX_OTHER_MEMBERS,
  GROUP_NAME_MAX_LENGTH,
  USER_SEARCH_MIN_QUERY_LENGTH,
  type UserSummary,
} from '@realtime-chat/contracts';
import {
  ZardAlertComponent,
  ZardAvatarComponent,
  ZardButtonComponent,
  ZardDialogImports,
  ZardInputComponent,
} from '@realtime-chat/ui';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  map,
  type Observable,
  of,
  startWith,
  switchMap,
} from 'rxjs';
import { initials } from './conversation-display';

type Mode = 'dm' | 'group';

type SearchState =
  | { status: 'idle'; users: UserSummary[] }
  | { status: 'searching'; users: UserSummary[] }
  | { status: 'done'; users: UserSummary[] }
  | { status: 'error'; users: UserSummary[] };

const SEARCH_DEBOUNCE_MS = 250;
const IDLE: SearchState = { status: 'idle', users: [] };

/**
 * Starts a direct message (pick one person) or a group (name + people).
 * Dumb about the outcome: emits `create`; the parent dispatches it and closes
 * the dialog once the conversation exists. `pending`/`error` come back in.
 */
@Component({
  selector: 'chat-new-conversation-dialog',
  imports: [
    ZardDialogImports,
    ZardButtonComponent,
    ZardInputComponent,
    ZardAvatarComponent,
    ZardAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-dialog [(zVisible)]="open" zWidth="28rem">
      <z-dialog-header>
        <z-dialog-title zTitle="New conversation" />
        <z-dialog-description
          zDescription="Message one person, or start a group."
        />
      </z-dialog-header>

      <form
        class="flex flex-col gap-4"
        data-testid="new-conversation-form"
        (submit)="submit($event)"
      >
        <div class="grid grid-cols-2 gap-2" role="group" aria-label="Type">
          <button
            z-button
            type="button"
            [zType]="mode() === 'dm' ? 'default' : 'outline'"
            [attr.aria-pressed]="mode() === 'dm'"
            data-testid="mode-dm"
            (click)="setMode('dm')"
          >
            Direct message
          </button>
          <button
            z-button
            type="button"
            [zType]="mode() === 'group' ? 'default' : 'outline'"
            [attr.aria-pressed]="mode() === 'group'"
            data-testid="mode-group"
            (click)="setMode('group')"
          >
            Group
          </button>
        </div>

        @if (mode() === 'group') {
          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Group name
            <input
              z-input
              type="text"
              name="groupName"
              autocomplete="off"
              placeholder="e.g. Weekend trip"
              data-testid="group-name"
              [attr.maxlength]="groupNameMax"
              [value]="groupName()"
              (valueChange)="groupName.set($event?.toString() ?? '')"
            />
          </label>
        }

        <label class="flex flex-col gap-1.5 text-sm font-medium">
          {{ mode() === 'dm' ? 'Person' : 'Members' }}
          <input
            z-input
            type="search"
            name="userSearch"
            autocomplete="off"
            placeholder="Search by username"
            data-testid="user-search"
            [value]="query()"
            (valueChange)="query.set($event?.toString() ?? '')"
          />
        </label>

        @if (selected().length > 0) {
          <ul
            class="flex flex-wrap gap-2"
            aria-label="Selected"
            data-testid="selected-users"
          >
            @for (user of selected(); track user.id) {
              <li>
                <button
                  z-button
                  type="button"
                  zType="secondary"
                  zSize="sm"
                  [attr.aria-label]="'Remove ' + user.displayName"
                  data-testid="selected-user"
                  (click)="toggle(user)"
                >
                  {{ user.displayName }} ✕
                </button>
              </li>
            }
          </ul>
        }

        <div class="min-h-24" aria-live="polite">
          @switch (search().status) {
            @case ('idle') {
              <p class="text-xs text-muted-foreground">
                Type at least {{ minQuery }} characters of a username.
              </p>
            }
            @case ('error') {
              <p class="text-xs text-destructive" data-testid="search-error">
                Search failed. Check your connection and try again.
              </p>
            }
            @default {
              <ul
                class="flex max-h-56 flex-col overflow-y-auto"
                data-testid="search-results"
              >
                @for (user of search().users; track user.id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      [class.bg-muted]="isSelected(user)"
                      [attr.aria-pressed]="isSelected(user)"
                      data-testid="search-result"
                      (click)="toggle(user)"
                    >
                      <z-avatar zSize="sm" [zFallback]="initialsOf(user)" />
                      <span class="flex min-w-0 flex-col">
                        <span class="truncate text-sm">{{
                          user.displayName
                        }}</span>
                        <span class="truncate text-xs text-muted-foreground"
                          >@{{ user.username }}</span
                        >
                      </span>
                    </button>
                  </li>
                } @empty {
                  <li class="text-xs text-muted-foreground">
                    {{
                      search().status === 'searching'
                        ? 'Searching…'
                        : 'No users found.'
                    }}
                  </li>
                }
              </ul>
            }
          }
        </div>

        @if (error(); as failure) {
          <z-alert
            zType="destructive"
            [zTitle]="failure.message"
            data-testid="create-error"
          />
        }

        <z-dialog-footer>
          <button z-button type="button" zType="outline" z-dialog-close>
            Cancel
          </button>
          <button
            z-button
            type="submit"
            data-testid="create-conversation"
            [zDisabled]="!canSubmit()"
          >
            {{
              pending()
                ? 'Creating…'
                : mode() === 'dm'
                  ? 'Start chat'
                  : 'Create group'
            }}
          </button>
        </z-dialog-footer>
      </form>
    </z-dialog>
  `,
})
export class NewConversationDialog {
  private readonly directory = inject(UserDirectory);

  readonly open = model(false);
  readonly pending = input(false);
  /** The last create error; shown only if it answers this dialog's submit. */
  readonly createError = input<RequestError | null>(null);
  readonly create = output<CreateConversationRequest>();

  protected readonly minQuery = USER_SEARCH_MIN_QUERY_LENGTH;
  protected readonly groupNameMax = GROUP_NAME_MAX_LENGTH;

  protected readonly mode = signal<Mode>('dm');
  protected readonly groupName = signal('');
  protected readonly query = signal('');
  protected readonly selected = signal<UserSummary[]>([]);
  private readonly submitted = signal(false);

  protected readonly search = toSignal(
    toObservable(this.query).pipe(
      map((q) => q.trim().toLowerCase()),
      debounceTime(SEARCH_DEBOUNCE_MS),
      distinctUntilChanged(),
      switchMap((q) => this.searchState(q)),
    ),
    { initialValue: IDLE },
  );

  protected readonly error = computed(() =>
    this.submitted() && !this.pending() ? this.createError() : null,
  );

  protected readonly canSubmit = computed(() => {
    if (this.pending()) return false;
    const count = this.selected().length;
    return this.mode() === 'dm'
      ? count === 1
      : count >= 1 &&
          count <= GROUP_MAX_OTHER_MEMBERS &&
          this.groupName().trim().length > 0;
  });

  constructor() {
    // Every opening starts from a blank form.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.mode.set('dm');
        this.groupName.set('');
        this.query.set('');
        this.selected.set([]);
        this.submitted.set(false);
      });
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
    // A DM has exactly one other person.
    if (mode === 'dm') this.selected.update((users) => users.slice(0, 1));
  }

  protected isSelected(user: UserSummary): boolean {
    return this.selected().some((u) => u.id === user.id);
  }

  protected toggle(user: UserSummary): void {
    this.submitted.set(false);
    if (this.isSelected(user)) {
      this.selected.update((users) => users.filter((u) => u.id !== user.id));
    } else if (this.mode() === 'dm') {
      this.selected.set([user]);
    } else if (this.selected().length < GROUP_MAX_OTHER_MEMBERS) {
      this.selected.update((users) => [...users, user]);
    }
  }

  protected initialsOf(user: UserSummary): string {
    return initials(user.displayName);
  }

  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.canSubmit()) return;
    const users = this.selected();
    this.submitted.set(true);
    this.create.emit(
      this.mode() === 'dm'
        ? { type: 'dm', userId: users[0].id }
        : {
            type: 'group',
            name: this.groupName().trim(),
            memberIds: users.map((u) => u.id),
          },
    );
  }

  private searchState(q: string): Observable<SearchState> {
    if (q.length < USER_SEARCH_MIN_QUERY_LENGTH) return of(IDLE);
    return this.directory.search(q).pipe(
      map((users): SearchState => ({ status: 'done', users })),
      startWith<SearchState>({ status: 'searching', users: [] }),
      catchError(() => of<SearchState>({ status: 'error', users: [] })),
    );
  }
}
