import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { AuthActions, selectCurrentUser } from '@realtime-chat/auth';
import { ZardButtonComponent, ZardCardImports } from '@realtime-chat/ui';

/** Standalone mode only: where a successful sign-in lands on port 4201. */
@Component({
  selector: 'auth-signed-in-page',
  imports: [ZardCardImports, ZardButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-card class="mx-auto w-full max-w-sm" data-testid="signed-in-page">
      <z-card-header>
        <z-card-title zTitle="You are signed in" />
        <z-card-description
          [zDescription]="
            'As ' +
            (user()?.displayName ?? '') +
            ' (@' +
            (user()?.username ?? '') +
            ')'
          "
        />
      </z-card-header>
      <z-card-footer class="justify-between gap-2">
        <a z-button href="http://localhost:4200/chat">Open the chat</a>
        <button z-button zType="outline" type="button" (click)="signOut()">
          Sign out
        </button>
      </z-card-footer>
    </z-card>
  `,
})
export class SignedInPage {
  private readonly store = inject(Store);
  protected readonly user = this.store.selectSignal(selectCurrentUser);

  protected signOut(): void {
    this.store.dispatch(AuthActions.logout());
  }
}
