# auth (frontend)

Browser side of authentication: NgRx `auth` feature, `provideAuth()` (state,
effects, HTTP interceptor, silent refresh at startup), `authGuard` /
`guestGuard`. The access token lives in the store only (memory), never in
localStorage; the refresh token is an httpOnly cookie the browser handles.

Registered once by the app that owns the session (the shell, or a remote
running standalone). Remotes only dispatch `AuthActions` and read selectors.
