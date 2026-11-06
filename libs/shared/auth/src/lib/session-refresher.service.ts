import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import type { AuthResponse } from '@realtime-chat/contracts';
import {
  defer,
  finalize,
  firstValueFrom,
  from,
  type Observable,
  shareReplay,
  tap,
} from 'rxjs';
import { AuthActions } from './auth.actions';
import { AuthApiService } from './auth-api.service';
import { isUnauthorized } from './http-errors';

/** Web Locks name shared by every tab of this origin. */
export const REFRESH_LOCK_NAME = 'realtime-chat:auth-refresh';

/** The part of `navigator.locks` this service uses (absent in old browsers). */
interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

/**
 * Exchanges the refresh cookie for a new access token, safely:
 *
 * - single-flight: concurrent callers in this tab share one request;
 * - across tabs: a Web Lock serialises refreshes, so a tab waits while
 *   another one rotates the cookie, then refreshes with the new cookie
 *   (instead of presenting the old one and looking like a token thief);
 * - a 401 is retried once (no Web Locks, or a lost race), then the session
 *   is over: `sessionEnded`. Other errors (network…) end nothing.
 *
 * Success dispatches `sessionEstablished` with the new token.
 */
@Injectable()
export class SessionRefresher {
  private readonly api = inject(AuthApiService);
  private readonly store = inject(Store);
  private inflight: Observable<AuthResponse> | null = null;

  refresh(): Observable<AuthResponse> {
    this.inflight ??= defer(() =>
      from(this.withLock(() => this.refreshWithOneRetry())),
    ).pipe(
      tap({
        next: (response) =>
          this.store.dispatch(AuthActions.sessionEstablished({ response })),
        error: (error: unknown) => {
          if (isUnauthorized(error)) {
            this.store.dispatch(
              AuthActions.sessionEnded({ reason: 'refresh-failed' }),
            );
          }
        },
      }),
      finalize(() => {
        this.inflight = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inflight;
  }

  private async refreshWithOneRetry(): Promise<AuthResponse> {
    try {
      return await firstValueFrom(this.api.refresh());
    } catch (error) {
      if (!isUnauthorized(error)) throw error;
      // Another tab may have just rotated the cookie: try once with it.
      return firstValueFrom(this.api.refresh());
    }
  }

  private withLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = (
      globalThis.navigator as { locks?: LockManagerLike } | undefined
    )?.locks;
    return locks ? locks.request(REFRESH_LOCK_NAME, task) : task();
  }
}
