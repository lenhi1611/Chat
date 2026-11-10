import { HttpErrorResponse } from '@angular/common/http';
import { isApiError } from '@realtime-chat/contracts';
import type { AuthError } from './auth.models';

/** The `{ error: { code } }` code of an HTTP error, if the API sent one. */
export function apiErrorCode(error: unknown): string | undefined {
  return error instanceof HttpErrorResponse && isApiError(error.error)
    ? error.error.error.code
    : undefined;
}

/** Shown instead of the server's technical wording for SERVICE_UNAVAILABLE. */
export const SERVICE_UNAVAILABLE_MESSAGE =
  'The service is temporarily unavailable. Please try again in a moment.';

/** A failed register/login as shown on the form. */
export function toAuthError(error: unknown): AuthError {
  if (isServiceUnavailable(error)) {
    return {
      code: 'SERVICE_UNAVAILABLE',
      message: SERVICE_UNAVAILABLE_MESSAGE,
    };
  }
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

/** A backend service did not answer (503, with or without an API error body). */
function isServiceUnavailable(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    (error.status === 503 ||
      (isApiError(error.error) &&
        error.error.error.code === 'SERVICE_UNAVAILABLE'))
  );
}
