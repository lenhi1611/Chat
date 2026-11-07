import type { AbstractControl, ValidationErrors } from '@angular/forms';
import type { AuthError } from '@realtime-chat/auth';
import type { ApiErrorCode } from '@realtime-chat/contracts';
import type { ZardFieldErrorEntry } from '@realtime-chat/ui';

type MessageFor = (errors: ValidationErrors) => string | null;

/** English messages for the validators used by the auth forms. */
export const describeClientErrors =
  (label: string): MessageFor =>
  (errors) => {
    if (errors['required']) return `${label} is required.`;
    if (errors['email']) return 'Enter a valid email address.';
    if (errors['minlength']) {
      return `${label} needs at least ${errors['minlength'].requiredLength} characters.`;
    }
    if (errors['maxlength']) {
      return `${label} can have at most ${errors['maxlength'].requiredLength} characters.`;
    }
    if (errors['pattern']) {
      return `${label} may only contain lowercase letters, digits and _.`;
    }
    if (errors['blank']) return `${label} cannot be blank.`;
    return null;
  };

/** Server codes that belong to one field rather than to the whole form. */
const FIELD_OF_CODE: Partial<Record<ApiErrorCode, string>> = {
  EMAIL_TAKEN: 'email',
  USERNAME_TAKEN: 'username',
};

/**
 * Errors under one input: the client validators once the field was touched
 * (or the form submitted), plus what the server said about this field.
 */
export function fieldErrors(
  name: string,
  control: AbstractControl,
  describe: MessageFor,
  serverError: AuthError | null,
  submitted: boolean,
): ZardFieldErrorEntry[] {
  const entries: ZardFieldErrorEntry[] = [];
  if (control.errors && (control.touched || submitted)) {
    const message = describe(control.errors);
    if (message) entries.push({ message });
  }
  if (serverError) {
    if (FIELD_OF_CODE[serverError.code as ApiErrorCode] === name) {
      entries.push({ message: serverError.message });
    }
    for (const detail of serverError.details ?? []) {
      if (detail.path === name) entries.push({ message: detail.message });
    }
  }
  return entries;
}

/** The server error to show above the form (not tied to one field). */
export function formLevelError(
  serverError: AuthError | null,
  fields: readonly string[],
): string | null {
  if (!serverError) return null;
  if (FIELD_OF_CODE[serverError.code as ApiErrorCode]) return null;
  if (
    serverError.details?.length &&
    serverError.details.every((d) => fields.includes(d.path))
  ) {
    return null;
  }
  return serverError.message;
}

/** Fails for strings that are empty once trimmed (the API trims too). */
export const notBlank = (control: AbstractControl): ValidationErrors | null =>
  typeof control.value === 'string' &&
  control.value.length > 0 &&
  control.value.trim().length === 0
    ? { blank: true }
    : null;
