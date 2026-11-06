import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { selectAuthStatus } from '@realtime-chat/auth';
import { filter, map, take } from 'rxjs';

/** "/" has no page of its own: chat when signed in, login otherwise. */
export const homeRedirect: CanActivateFn = () => {
  const router = inject(Router);
  return inject(Store)
    .select(selectAuthStatus)
    .pipe(
      filter((status) => status !== 'unknown'),
      take(1),
      map((status) =>
        router.parseUrl(status === 'authenticated' ? '/chat' : '/auth/login'),
      ),
    );
};
