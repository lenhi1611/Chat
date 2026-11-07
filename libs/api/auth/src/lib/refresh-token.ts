import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, URL-safe: what the browser keeps in the cookie. */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 (hex) of a token: what the database keeps. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
