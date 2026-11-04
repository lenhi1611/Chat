import { Routes } from '@angular/router';

/**
 * Root routes of the chat micro-frontend.
 * Exposed to the shell as `./routes` (see federation.config.mjs) and also used
 * when the app runs standalone on port 4202.
 */
export const CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./chat-home/chat-home').then((m) => m.ChatHome),
  },
];
