import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import {
  catchError,
  EMPTY,
  exhaustMap,
  filter,
  ignoreElements,
  map,
  mergeMap,
  of,
  pairwise,
  tap,
} from 'rxjs';
import { AuthActions } from './auth.actions';
import { AUTH_CONFIG } from './auth.config';
import { safeReturnUrl } from './return-url';
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
          mergeMap((response) => [
            AuthActions.sessionEstablished({ response }),
            AuthActions.signedIn(),
          ]),
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
          mergeMap((response) => [
            AuthActions.sessionEstablished({ response }),
            AuthActions.signedIn(),
          ]),
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

/** After login/register: the page the user wanted (?returnUrl), if safe. */
export const navigateAfterSignIn$ = createEffect(
  (
    actions$ = inject(Actions),
    router = inject(Router),
    config = inject(AUTH_CONFIG),
  ) =>
    actions$.pipe(
      ofType(AuthActions.signedIn),
      tap(() => {
        const returnUrl = router
          .parseUrl(router.url)
          .queryParamMap.get('returnUrl');
        void router.navigateByUrl(
          safeReturnUrl(returnUrl, config.defaultAuthenticatedPath),
        );
      }),
    ),
  { functional: true, dispatch: false },
);

/**
 * A session that existed has ended (signed out here, or lost: refresh failed,
 * revoked elsewhere): back to the login page, with a returnUrl unless the user
 * chose to leave. A startup without session is left to the guards.
 */
export const navigateAfterSessionEnd$ = createEffect(
  (
    actions$ = inject(Actions),
    router = inject(Router),
    config = inject(AUTH_CONFIG),
  ) =>
    actions$.pipe(
      ofType(AuthActions.sessionEstablished, AuthActions.sessionEnded),
      pairwise(),
      filter(
        ([previous, current]) =>
          previous.type === AuthActions.sessionEstablished.type &&
          current.type === AuthActions.sessionEnded.type,
      ),
      tap(([, ended]) => {
        const lost =
          'reason' in ended &&
          ended.reason !== 'signed-out' &&
          !router.url.startsWith(config.loginPath);
        void router.navigate([config.loginPath], {
          queryParams: lost ? { returnUrl: router.url } : {},
        });
      }),
    ),
  { functional: true, dispatch: false },
);

export const authEffects = {
  login$,
  register$,
  refresh$,
  logout$,
  navigateAfterSignIn$,
  navigateAfterSessionEnd$,
};
