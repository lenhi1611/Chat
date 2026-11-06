import { Route } from '@angular/router';
import { authGuard, guestGuard } from '@realtime-chat/auth';

// Standalone mode only: the shell mounts AUTH_ROUTES under /auth instead.
export const appRoutes: Route[] = [
  {
    path: 'signed-in',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./signed-in/signed-in-page').then((m) => m.SignedInPage),
  },
  {
    path: '',
    canActivate: [guestGuard],
    loadChildren: () => import('./auth.routes').then((m) => m.AUTH_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
