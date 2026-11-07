import { Route } from '@angular/router';
import { authGuard, guestGuard } from '@realtime-chat/auth';
import { homeRedirect } from './auth/home-redirect';
import { loadRemoteRoutes } from './federation/load-remote-routes';

export const appRoutes: Route[] = [
  // "/" goes to the chat when signed in, to the login page otherwise.
  { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadChildren: loadRemoteRoutes('mfe-auth', './routes', 'AUTH_ROUTES'),
  },
  {
    path: 'chat',
    canActivate: [authGuard],
    loadChildren: loadRemoteRoutes('mfe-chat', './routes', 'CHAT_ROUTES'),
  },
  // Phase 0 smoke page: API health (public).
  {
    path: 'status',
    title: 'Status · Realtime Chat',
    loadComponent: () => import('./home/home-page').then((m) => m.HomePage),
  },
  { path: '**', redirectTo: '' },
];
