import { HttpErrorResponse } from '@angular/common/http';
import { isApiError } from '@realtime-chat/contracts';
import type { AuthError } from './auth.models';

/** The `{ error: { code } }` code of an HTTP error, if the API sent one. */
export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse && isApiError(error.error)
    ? error.error.error.code
    : undefined;
}

/** A failed register/login as shown on the form. */
export function toAuthError(error: unknown): AuthError {
  if (error instanceof HttpErrorResponse && isApiError(error.error)) {
    const { code, message, details } = error.error.error;
    return { code, message, ...(details && { details }) };
  }
  return {
    code: 'NETWORK_ERROR',
    message: 'Cannot reach the server. Check your connection and try again.',
  };
}

export const isUnauthorized = (error: unknown): boolean =>
  error instanceof HttpErrorResponse && error.status === 401;
