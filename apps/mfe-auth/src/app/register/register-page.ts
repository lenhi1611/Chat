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
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
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
  notBlank,
} from '../forms/field-errors';

type Field = 'email' | 'username' | 'displayName' | 'password';

const LABELS: Record<Field, string> = {
  email: 'Email',
  username: 'Username',
  displayName: 'Display name',
  password: 'Password',
};

/**
 * Sign-up form. Limits mirror the API (contracts); the server stays the
 * judge (EMAIL_TAKEN, USERNAME_TAKEN… are shown under their field).
 */
@Component({
  selector: 'auth-register-page',
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
    <z-card class="mx-auto w-full max-w-sm" data-testid="register-page">
      <z-card-header>
        <z-card-title zTitle="Create an account" />
        <z-card-description
          zDescription="Pick a username others can find you by."
        />
      </z-card-header>
      <z-card-content>
        <form
          [formGroup]="form"
          (ngSubmit)="submit()"
          novalidate
          data-testid="register-form"
        >
          <z-field-group>
            @if (formError(); as message) {
              <z-alert
                zType="destructive"
                zTitle="Could not create the account"
                [zDescription]="message"
                data-testid="form-error"
              />
            }
            <z-field>
              <label z-field-label for="register-email">Email</label>
              <input
                z-input
                id="register-email"
                type="email"
                autocomplete="email"
                formControlName="email"
                data-testid="email"
                [attr.aria-invalid]="errors('email').length > 0 || null"
              />
              <z-field-error [zErrors]="errors('email')" />
            </z-field>
            <z-field>
              <label z-field-label for="register-username">Username</label>
              <input
                z-input
                id="register-username"
                autocomplete="username"
                formControlName="username"
                data-testid="username"
                [attr.aria-invalid]="errors('username').length > 0 || null"
              />
              <p z-field-description>
                {{ usernameMin }}–{{ usernameMax }} characters: a–z, 0–9 and _.
              </p>
              <z-field-error [zErrors]="errors('username')" />
            </z-field>
            <z-field>
              <label z-field-label for="register-display-name"
                >Display name</label
              >
              <input
                z-input
                id="register-display-name"
                autocomplete="name"
                formControlName="displayName"
                data-testid="displayName"
                [attr.aria-invalid]="errors('displayName').length > 0 || null"
              />
              <z-field-error [zErrors]="errors('displayName')" />
            </z-field>
            <z-field>
              <label z-field-label for="register-password">Password</label>
              <z-input-group>
                <input
                  z-input
                  id="register-password"
                  autocomplete="new-password"
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
              <p z-field-description>At least {{ passwordMin }} characters.</p>
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
              {{ pending() ? 'Creating account…' : 'Create account' }}
            </button>
            <p class="text-center text-sm text-muted-foreground">
              Already registered?
              <a
                routerLink="../login"
                queryParamsHandling="preserve"
                class="font-medium text-foreground underline underline-offset-4"
                data-testid="to-login"
                >Sign in</a
              >
            </p>
          </z-field-group>
        </form>
      </z-card-content>
    </z-card>
  `,
})
export class RegisterPage {
  private readonly store = inject(Store);

  protected readonly usernameMin = USERNAME_MIN_LENGTH;
  protected readonly usernameMax = USERNAME_MAX_LENGTH;
  protected readonly passwordMin = PASSWORD_MIN_LENGTH;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: [
      '',
      [
        Validators.required,
        Validators.email,
        Validators.maxLength(EMAIL_MAX_LENGTH),
      ],
    ],
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(USERNAME_MIN_LENGTH),
        Validators.maxLength(USERNAME_MAX_LENGTH),
        // Lowercased by the API; reject only what it would refuse.
        Validators.pattern(/^\s*[A-Za-z0-9_]+\s*$/),
      ],
    ],
    displayName: [
      '',
      [
        Validators.required,
        notBlank,
        Validators.maxLength(DISPLAY_NAME_MAX_LENGTH),
      ],
    ],
    password: [
      '',
      [
        Validators.required,
        Validators.minLength(PASSWORD_MIN_LENGTH),
        Validators.maxLength(PASSWORD_MAX_LENGTH),
      ],
    ],
  });
  protected readonly pending = this.store.selectSignal(selectAuthPending);
  private readonly serverError = this.store.selectSignal(selectAuthError);
  protected readonly showPassword = signal(false);
  private readonly submitted = signal(false);

  protected readonly formError = () =>
    formLevelError(this.serverError(), Object.keys(LABELS));

  constructor() {
    this.store.dispatch(AuthActions.errorCleared());
  }

  protected errors(name: Field) {
    return fieldErrors(
      name,
      this.form.controls[name],
      describeClientErrors(LABELS[name]),
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
      AuthActions.register({ request: this.form.getRawValue() }),
    );
  }
}
