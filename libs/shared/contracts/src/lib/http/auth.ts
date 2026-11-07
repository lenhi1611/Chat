import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './limits';
import {
  currentUserSchema,
  displayNameField,
  emailField,
  usernameField,
} from './users';

/**
 * Passwords are never trimmed or normalised: what the user typed is what gets
 * hashed. Only the length is checked.
 */
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .max(PASSWORD_MAX_LENGTH);

/** `POST /auth/register` */
export const registerRequestSchema = z.object({
  email: emailField,
  username: usernameField,
  displayName: displayNameField,
  password: newPassword,
});

/**
 * `POST /auth/login`. The password only has to be non-empty (and bounded):
 * login must not reveal the password policy or reject old passwords early.
 */
export const loginRequestSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

/** Register, login and refresh. The refresh token travels as a cookie only. */
export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  /** Access token lifetime in seconds. */
  expiresIn: z.number().int().positive(),
  user: currentUserSchema,
});

/** `POST /auth/ws-ticket`: single-use ticket for `ws://…/ws?ticket=…`. */
export const wsTicketResponseSchema = z.object({
  ticket: z.string().min(1),
  /** Seconds before an unused ticket expires. */
  expiresIn: z.number().int().positive(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type WsTicketResponse = z.infer<typeof wsTicketResponseSchema>;
