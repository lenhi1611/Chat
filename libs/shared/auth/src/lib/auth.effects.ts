import { inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, EMPTY, exhaustMap, ignoreElements, map, of } from 'rxjs';
import { AuthActions } from './auth.actions';
import { AuthApiService } from './auth-api.service';
import { toAuthError } from './http-errors';
import { SessionRefresher } from './session-refresher.service';

/** `exhaustMap`: a second click while the first request runs is ignored. */
export const login$ = createEffect(
  (actions$ = inject(Actions), api = inject(AuthApiService)) =>
    actions$.pipe(
      ofType(AuthActions.login),
      exhaustMap(({ request }) =>
        api.login(request).pipe(
          map((response) => AuthActions.sessionEstablished({ response })),
          catchError((error: unknown) =>
            of(AuthActions.requestFailed({ error: toAuthError(error) })),
          ),
        ),
      ),
    ),
  { functional: true },
);

export const register$ = createEffect(
  (actions$ = inject(Actions), api = inject(AuthApiService)) =>
    actions$.pipe(
      ofType(AuthActions.register),
      exhaustMap(({ request }) =>
        api.register(request).pipe(
          map((response) => AuthActions.sessionEstablished({ response })),
          catchError((error: unknown) =>
            of(AuthActions.requestFailed({ error: toAuthError(error) })),
          ),
        ),
      ),
    ),
  { functional: true },
);

/** The refresher dispatches the outcome itself (shared with the interceptor). */
export const refresh$ = createEffect(
  (actions$ = inject(Actions), refresher = inject(SessionRefresher)) =>
    actions$.pipe(
      ofType(AuthActions.refresh),
      exhaustMap(() =>
        refresher.refresh().pipe(
          ignoreElements(),
          catchError(() => EMPTY),
        ),
      ),
    ),
  { functional: true, dispatch: false },
);

/**
 * The server revokes the session and clears the cookie. Signed out locally
 * whatever happens (offline included): the user asked to leave.
 */
export const logout$ = createEffect(
  (actions$ = inject(Actions), api = inject(AuthApiService)) =>
    actions$.pipe(
      ofType(AuthActions.logout),
      exhaustMap(() =>
        api.logout().pipe(
          catchError(() => of(null)),
          map(() => AuthActions.sessionEnded({ reason: 'signed-out' })),
        ),
      ),
    ),
  { functional: true },
);

export const authEffects = { login$, register$, refresh$, logout$ };
