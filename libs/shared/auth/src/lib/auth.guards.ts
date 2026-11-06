import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { filter, map, take } from 'rxjs';
import { AUTH_CONFIG } from './auth.config';
import { selectAuthStatus } from './auth.feature';
import { safeReturnUrl } from './return-url';

/** The auth status once the startup refresh has answered. */
const settledStatus = () =>
  inject(Store)
    .select(selectAuthStatus)
    .pipe(
      filter((status) => status !== 'unknown'),
      take(1),
    );

/** Signed-in users only; guests go to the login page with a returnUrl. */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  const { loginPath } = inject(AUTH_CONFIG);
  return settledStatus().pipe(
    map((status) =>
      status === 'authenticated'
        ? true
        : router.createUrlTree([loginPath], {
            queryParams: { returnUrl: state.url },
          }),
    ),
  );
};

/** Guests only (login, register); signed-in users go to their returnUrl. */
export const guestGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  const { defaultAuthenticatedPath } = inject(AUTH_CONFIG);
  return settledStatus().pipe(
    map((status) =>
      status === 'authenticated'
        ? router.parseUrl(
            safeReturnUrl(
              route.queryParamMap.get('returnUrl'),
              defaultAuthenticatedPath,
            ),
          )
        : true,
    ),
  );
};
