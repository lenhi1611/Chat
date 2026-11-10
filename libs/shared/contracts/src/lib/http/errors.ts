import { z } from 'zod';

/**
 * Error codes of the REST API, with the HTTP status each one is sent with.
 * Clients branch on `code`, never on `message` (human-readable, may change).
 *
 * The one `code → HTTP status` table: services throw / reply these codes
 * over RabbitMQ, the api-gateway maps them to a status with this table.
 */
export const API_ERROR_STATUS = {
  /** Body, query or params failed schema validation (see `details`). */
  VALIDATION_FAILED: 400,
  /** Wrong email or password. Deliberately does not say which one. */
  INVALID_CREDENTIALS: 401,
  /** No (or a malformed / badly signed) access token. */
  UNAUTHENTICATED: 401,
  /** Access token was valid but has expired: refresh, then retry once. */
  TOKEN_EXPIRED: 401,
  /** Refresh token missing, unknown, expired, revoked or reused. */
  INVALID_REFRESH_TOKEN: 401,
  FORBIDDEN: 403,
  /** Missing resource, or one the caller may not see (no existence leak). */
  NOT_FOUND: 404,
  EMAIL_TAKEN: 409,
  USERNAME_TAKEN: 409,
  INTERNAL_ERROR: 500,
  /**
   * A backend service did not answer: RPC timeout, no consumer, or the broker
   * is unreachable. Safe to retry later.
   */
  SERVICE_UNAVAILABLE: 503,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;

export const API_ERROR_CODES = Object.keys(API_ERROR_STATUS) as [
  ApiErrorCode,
  ...ApiErrorCode[],
];

/** One failed field of a VALIDATION_FAILED error. */
export const validationIssueSchema = z.object({
  /** Dotted path of the field, e.g. `memberIds.2`; empty for the root. */
  path: z.string(),
  message: z.string(),
});

/** Body of every non-2xx REST response. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.enum(API_ERROR_CODES),
    message: z.string(),
    details: z.array(validationIssueSchema).optional(),
  }),
});

export type ValidationIssue = z.infer<typeof validationIssueSchema>;
export type ApiError = z.infer<typeof apiErrorSchema>;

/** True when `body` is an {@link ApiError} (e.g. `HttpErrorResponse.error`). */
export function isApiError(body: unknown): body is ApiError {
  return apiErrorSchema.safeParse(body).success;
}
