import {
  type HttpEvent,
  type HttpHandler,
  type HttpHandlerFn,
  type HttpInterceptor,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import {
  EnvironmentInjector,
  inject,
  Injectable,
  runInInjectionContext,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { API_PATHS } from '@realtime-chat/contracts';
import { catchError, type Observable, switchMap, take, throwError } from 'rxjs';
import { AUTH_CONFIG } from './auth.config';
import { selectAccessToken } from './auth.feature';
import { apiErrorCode } from './http-errors';
import { SessionRefresher } from './session-refresher.service';

/** Auth routes that work with the cookie (or nothing), never a Bearer token. */
const COOKIE_ROUTES = new Set<string>([
  API_PATHS.auth.register,
  API_PATHS.auth.login,
  API_PATHS.auth.refresh,
  API_PATHS.auth.logout,
]);

const withBearer = (request: HttpRequest<unknown>, token: string | null) =>
  token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

/**
 * - Adds `Authorization: Bearer` to requests for the API only (never to
 *   another origin), except the cookie-based auth routes.
 * - On 401 TOKEN_EXPIRED: refreshes once for all concurrent requests
 *   (SessionRefresher is single-flight) and retries the request once with the
 *   new token. If refreshing fails, the refresher ends the session and the
 *   original error goes back to the caller.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const { apiBaseUrl } = inject(AUTH_CONFIG);
  if (!request.url.startsWith(`${apiBaseUrl}/`)) return next(request);
  const path = request.url.slice(apiBaseUrl.length + 1).split(/[?#]/)[0];
  if (COOKIE_ROUTES.has(path)) return next(request);

  const store = inject(Store);
  const refresher = inject(SessionRefresher);
  return store.select(selectAccessToken).pipe(
    take(1),
    switchMap((token) =>
      next(withBearer(request, token)).pipe(
        catchError((error: unknown) => {
          if (apiErrorCode(error) !== 'TOKEN_EXPIRED') {
            return throwError(() => error);
          }
          return refresher.refresh().pipe(
            catchError(() => throwError(() => error)),
            switchMap((response) =>
              next(withBearer(request, response.accessToken)),
            ),
          );
        }),
      ),
    ),
  );
};

/**
 * `authInterceptor` registered through DI (HTTP_INTERCEPTORS), so that
 * provideAuth() can install it. Needs `provideHttpClient(withInterceptorsFromDi())`.
 */
@Injectable()
export class AuthHttpInterceptor implements HttpInterceptor {
  private readonly injector = inject(EnvironmentInjector);

  intercept(
    request: HttpRequest<unknown>,
    next: HttpHandler,
  ): Observable<HttpEvent<unknown>> {
    const handle: HttpHandlerFn = (r) => next.handle(r);
    return runInInjectionContext(this.injector, () =>
      authInterceptor(request, handle),
    );
  }
}
