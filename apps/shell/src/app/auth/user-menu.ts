import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { AuthActions, selectCurrentUser } from '@realtime-chat/auth';
import { ZardButtonComponent } from '@realtime-chat/ui';

/** Header: who is signed in, and the way out (or in). */
@Component({
  selector: 'app-user-menu',
  imports: [RouterLink, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (user(); as user) {
      <span class="flex items-center gap-3 text-sm" data-testid="current-user">
        <span>
          <span class="font-medium">{{ user.displayName }}</span>
          <span class="text-muted-foreground"> @{{ user.username }}</span>
        </span>
        <button
          z-button
          zType="outline"
          zSize="sm"
          type="button"
          data-testid="sign-out"
          (click)="signOut()"
        >
          Sign out
        </button>
      </span>
    } @else {
      <a z-button zSize="sm" routerLink="/auth/login" data-testid="sign-in"
        >Sign in</a
      >
    }
  `,
})
export class UserMenu {
  private readonly store = inject(Store);
  protected readonly user = this.store.selectSignal(selectCurrentUser);

  protected signOut(): void {
    this.store.dispatch(AuthActions.logout());
  }
}
