import { Route } from '@angular/router';
import { authGuard, guestGuard } from '@realtime-chat/auth';

// Standalone mode only: the shell mounts CHAT_ROUTES under /chat instead.
// Without a session, guests land on /signed-out (provideAuth's loginPath).
export const appRoutes: Route[] = [
  {
    path: 'signed-out',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./signed-out-page').then((m) => m.SignedOutPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadChildren: () => import('./chat.routes').then((m) => m.CHAT_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
