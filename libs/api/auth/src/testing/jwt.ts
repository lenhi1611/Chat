import { createHmac } from 'node:crypto';

const b64url = (value: object | string) =>
  Buffer.from(
    typeof value === 'string' ? value : JSON.stringify(value),
  ).toString('base64url');

/**
 * Hand-made JWTs for negative tests: any header (alg none, HS512…), any
 * claims, any key. Signs with HMAC for HS256/HS512, nothing for `none`.
 */
export function craftJwt(
  header: { alg: string; typ?: string },
  payload: Record<string, unknown>,
  secret: string,
): string {
  const signingInput = `${b64url({ typ: 'JWT', ...header })}.${b64url(payload)}`;
  const algorithm = { HS256: 'sha256', HS512: 'sha512' }[header.alg];
  const signature = algorithm
    ? createHmac(algorithm, secret).update(signingInput).digest('base64url')
    : '';
  return `${signingInput}.${signature}`;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
