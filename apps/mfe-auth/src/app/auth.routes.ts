import { Routes } from '@angular/router';

/**
 * Root routes of the auth micro-frontend, exposed to the shell as `./routes`
 * (mounted under /auth, behind the shell's guestGuard) and reused standalone.
 * Pages only dispatch AuthActions and read selectors: the shell owns the
 * session (provideAuth).
 */
export const AUTH_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    title: 'Sign in · Realtime Chat',
    loadComponent: () => import('./login/login-page').then((m) => m.LoginPage),
  },
  {
    path: 'register',
    title: 'Create account · Realtime Chat',
    loadComponent: () =>
      import('./register/register-page').then((m) => m.RegisterPage),
  },
];
