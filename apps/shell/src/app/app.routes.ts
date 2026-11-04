import { Route } from '@angular/router';
import { loadRemoteRoutes } from './federation/load-remote-routes';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'chat',
    loadChildren: loadRemoteRoutes('mfe-chat', './routes', 'CHAT_ROUTES'),
  },
  { path: '**', redirectTo: '' },
];
