import { AppError } from '@realtime-chat/contracts';
import { craftJwt, nowSeconds } from '../testing/jwt';
import { AccessTokenService } from './access-token.service';
import type { AuthModuleOptions } from './auth.options';

const secret = 'a-test-secret-that-is-long-enough-123456';
const service = new AccessTokenService({
  jwtAccessSecret: secret,
  accessTokenTtlSeconds: 900,
} as AuthModuleOptions);

const claims = { sub: crypto.randomUUID(), sid: crypto.randomUUID() };

async function rejection(token: string): Promise<AppError> {
  const error = await service.verify(token).catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

describe('AccessTokenService', () => {
  it('signs HS256 tokens with sub, sid and a 15 min expiry, and verifies them', async () => {
    const token = await service.sign(claims);
    const [header, payload] = token
      .split('.')
      .slice(0, 2)
      .map((part) => JSON.parse(Buffer.from(part, 'base64url').toString()));
    expect(header.alg).toBe('HS256');
    expect(payload.exp - payload.iat).toBe(900);
    await expect(service.verify(token)).resolves.toEqual(claims);
  });

  it('reports an expired token as TOKEN_EXPIRED', async () => {
    const token = craftJwt(
      { alg: 'HS256' },
      { ...claims, iat: nowSeconds() - 1000, exp: nowSeconds() - 100 },
      secret,
    );
    expect((await rejection(token)).code).toBe('TOKEN_EXPIRED');
  });

  it.each([
    [
      'a wrong signature',
      craftJwt({ alg: 'HS256' }, claims, 'another-secret-another-secret-123'),
    ],
    ['alg "none"', craftJwt({ alg: 'none' }, claims, '')],
    [
      'another algorithm (HS512, same key)',
      craftJwt({ alg: 'HS512' }, claims, secret),
    ],
    ['missing sid', craftJwt({ alg: 'HS256' }, { sub: claims.sub }, secret)],
    ['garbage', 'not.a.jwt'],
  ])('rejects %s as UNAUTHENTICATED', async (_label, token) => {
    expect((await rejection(token)).code).toBe('UNAUTHENTICATED');
  });
});
