import { z } from 'zod';
import {
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  USER_SEARCH_MIN_QUERY_LENGTH,
} from './limits';

// --- reusable fields --------------------------------------------------------

/** Trimmed, lowercased, then checked: `Foo@Bar.com ` → `foo@bar.com`. */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(EMAIL_MAX_LENGTH)
  .pipe(z.email());

/** Trimmed and lowercased before the `[a-z0-9_]{3,20}` check. */
export const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_PATTERN, 'may only contain a-z, 0-9 and _');

export const displayNameField = z
  .string()
  .trim()
  .min(1)
  .max(DISPLAY_NAME_MAX_LENGTH);

// --- DTOs -------------------------------------------------------------------

/** Public view of a user: what other users may see. */
export const userSummarySchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
});

/** The signed-in user (`GET /auth/me`, auth responses). */
export const currentUserSchema = userSummarySchema.extend({
  email: z.string(),
  createdAt: z.iso.datetime(),
});

// --- requests ---------------------------------------------------------------

/** `GET /users/search?q=`: prefix match on username. */
export const searchUsersQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .toLowerCase()
    .min(USER_SEARCH_MIN_QUERY_LENGTH)
    .max(USERNAME_MAX_LENGTH),
});

export const searchUsersResponseSchema = z.array(userSummarySchema);

export type UserSummary = z.infer<typeof userSummarySchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type SearchUsersQuery = z.infer<typeof searchUsersQuerySchema>;
