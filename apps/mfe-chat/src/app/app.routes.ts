import { Route } from '@angular/router';

// Standalone mode only: the shell mounts CHAT_ROUTES under /chat instead.
export const appRoutes: Route[] = [
  {
    path: '',
    loadChildren: () => import('./chat.routes').then((m) => m.CHAT_ROUTES),
  },
  { path: '**', redirectTo: '' },
];
