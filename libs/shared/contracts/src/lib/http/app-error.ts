import type { ApiErrorCode, ValidationIssue } from './errors';

/**
 * Error with a REST error code, thrown by backend services and turned into an
 * `ApiError` body (and the HTTP status of its code) by the api-gateway's
 * exception filter. Framework-free: a plain Error subclass.
 */
export class AppError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}
