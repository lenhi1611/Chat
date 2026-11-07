import { inject, Injectable } from '@angular/core';
import {
  USER_SEARCH_MIN_QUERY_LENGTH,
  type UserSummary,
} from '@realtime-chat/contracts';
import { type Observable, of } from 'rxjs';
import { ChatApiService } from './chat-api.service';

/**
 * User lookup for pickers (new conversation). Results are short-lived UI
 * data, so they stay out of the Store. Registered by provideChatData: remotes
 * inject it from the shell's root injector.
 */
@Injectable()
export class UserDirectory {
  private readonly api = inject(ChatApiService);

  /** Users whose username starts with `query`; `[]` for a too-short query. */
  search(query: string): Observable<UserSummary[]> {
    const q = query.trim().toLowerCase();
    return q.length < USER_SEARCH_MIN_QUERY_LENGTH
      ? of([])
      : this.api.searchUsers(q);
  }
}
