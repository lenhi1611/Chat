import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import {
  AuthActions,
  selectAuthError,
  selectAuthPending,
} from '@realtime-chat/auth';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '@realtime-chat/contracts';
import {
  ZardAlertComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardFieldImports,
  ZardInputComponent,
  ZardInputGroupImports,
} from '@realtime-chat/ui';
import {
  describeClientErrors,
  fieldErrors,
  formLevelError,
} from '../forms/field-errors';

/**
 * Sign-in form. Dispatches `login`; the auth effects store the session and
 * navigate to the returnUrl. Reads pending/error from the store only.
 */
@Component({
  selector: 'auth-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ZardCardImports,
    ZardFieldImports,
    ZardInputComponent,
    ZardInputGroupImports,
    ZardButtonComponent,
    ZardAlertComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <z-card class="mx-auto w-full max-w-sm" data-testid="login-page">
      <z-card-header>
        <z-card-title zTitle="Sign in" />
        <z-card-description zDescription="Welcome back to Realtime Chat." />
      </z-card-header>
      <z-card-content>
        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          data-testid="login-form"
        >
          <z-field-group>
            @if (formError(); as message) {
              <z-alert
                zType="destructive"
                zTitle="Could not sign in"
                [zDescription]="message"
                data-testid="form-error"
              />
            }
            <z-field>
              <label z-field-label for="login-email">Email</label>
              <input
                z-input
                id="login-email"
                type="email"
                autocomplete="email"
                formControlName="email"
                data-testid="email"
                [attr.aria-invalid]="errors('email').length > 0 || null"
              />
              <z-field-error [zErrors]="errors('email')" />
            </z-field>
            <z-field>
              <label z-field-label for="login-password">Password</label>
              <z-input-group>
                <input
                  z-input
                  id="login-password"
                  autocomplete="current-password"
                  formControlName="password"
                  data-testid="password"
                  [type]="showPassword() ? 'text' : 'password'"
                  [attr.aria-invalid]="errors('password').length > 0 || null"
                />
                <z-input-group-addon zAlign="inline-end">
                  <button
                    z-input-group-button
                    type="button"
                    data-testid="toggle-password"
                    [attr.aria-pressed]="showPassword()"
                    (click)="showPassword.set(!showPassword())"
                  >
                    {{ showPassword() ? 'Hide' : 'Show' }}
                  </button>
                </z-input-group-addon>
              </z-input-group>
              <z-field-error [zErrors]="errors('password')" />
            </z-field>
            <button
              z-button
              type="submit"
              class="w-full"
              data-testid="submit"
              [zLoading]="pending()"
              [zDisabled]="pending()"
            >
              {{ pending() ? 'Signing in…' : 'Sign in' }}
            </button>
            <p class="text-center text-sm text-muted-foreground">
              No account yet?
              <a
                routerLink="../register"
                queryParamsHandling="preserve"
                class="font-medium text-foreground underline underline-offset-4"
                data-testid="to-register"
                >Create one</a
              >
            </p>
          </z-field-group>
        </form>
      </z-card-content>
    </z-card>
  `,
})
export class LoginPage {
  private readonly store = inject(Store);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        Validators.maxLength(EMAIL_MAX_LENGTH),
      ],
    ],
    password: [
      '',
      [Validators.required, Validators.maxLength(PASSWORD_MAX_LENGTH)],
    ],
  });
  protected readonly pending = this.store.selectSignal(selectAuthPending);
  private readonly serverError = this.store.selectSignal(selectAuthError);
  protected readonly showPassword = signal(false);
  private readonly submitted = signal(false);

  protected readonly formError = () =>
    formLevelError(this.serverError(), ['email', 'password']);

  constructor() {
    // A previous page's error must not show up here.
    this.store.dispatch(AuthActions.errorCleared());
  }

  protected errors(name: 'email' | 'password') {
    const labels = { email: 'Email', password: 'Password' };
    return fieldErrors(
      name,
      this.form.controls[name],
      describeClientErrors(labels[name]),
      this.serverError(),
      this.submitted(),
    );
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    this.store.dispatch(
      AuthActions.login({ request: this.form.getRawValue() }),
    );
  }
}
