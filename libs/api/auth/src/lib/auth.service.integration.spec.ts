import { createHash } from 'node:crypto';
import { AppError } from '@realtime-chat/contracts';
import {
  createAuthTestPrisma,
  truncateAuthTables,
} from '../testing/auth-test-db';
import { AccessTokenService } from './access-token.service';
import type { AuthModuleOptions } from './auth.options';
import { AuthService, type EndedSession } from './auth.service';
import { PasswordService } from './password.service';
import type { AuthPrismaService } from './prisma/auth-prisma.service';
import { UsersService } from './users.service';

/*
 * Sessions and refresh-token rotation, against auth_test.
 *
 * Ported from the Phase 2 api-gateway spec (auth.integration.spec.ts, removed
 * in a4f296e): same cases, called on AuthService instead of over HTTP, so
 * they keep holding once the service runs behind RabbitMQ.
 */

const options: AuthModuleOptions = {
  databaseUrl: '',
  jwtAccessSecret: 'a-test-secret-that-is-long-enough-123456',
  accessTokenTtlSeconds: 900,
  refreshTokenTtlDays: 7,
  refreshReuseGraceSeconds: 10,
  wsTicketTtlSeconds: 30,
};

let prisma: AuthPrismaService;
let auth: AuthService;
let ended: EndedSession[];

beforeAll(async () => {
  prisma = createAuthTestPrisma();
  await prisma.onModuleInit();
  auth = new AuthService(
    options,
    prisma,
    new UsersService(prisma),
    new PasswordService(),
    new AccessTokenService(options),
  );
  auth.sessionsEnded$.subscribe((session) => ended.push(session));
});
afterAll(() => prisma.onModuleDestroy());
beforeEach(async () => {
  ended = [];
  await truncateAuthTables(prisma);
});

let seq = 0;
function newUser() {
  seq += 1;
  return {
    email: `user${seq}@example.test`,
    username: `user_${seq}`,
    displayName: `User ${seq}`,
    password: `pass-${seq}-correct-horse`,
  };
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function errorCode(promise: Promise<unknown>): Promise<string> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  return (error as AppError).code;
}

describe('register and login', () => {
  it('stores an argon2id hash and only a SHA-256 hash of the refresh token', async () => {
    const user = newUser();
    const session = await auth.register(user);

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
    });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(stored.passwordHash).not.toContain(user.password);

    const tokens = await prisma.refreshToken.findMany();
    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenHash).toBe(sha256(session.refreshToken));
    expect(tokens[0].familyId).toBe(session.sid);
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const user = newUser();
    await auth.register(user);
    const wrong = auth.login({ email: user.email, password: 'nope-nope-nope' });
    const unknown = auth.login({
      email: 'nobody@example.test',
      password: user.password,
    });
    expect(await errorCode(wrong)).toBe('INVALID_CREDENTIALS');
    expect(await errorCode(unknown)).toBe('INVALID_CREDENTIALS');
  });
});

describe('refresh', () => {
  it('rotates the refresh token and keeps the same session', async () => {
    const first = await auth.register(newUser());
    const next = await auth.refresh(first.refreshToken);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.sid).toBe(first.sid);

    const [old, current] = await prisma.refreshToken.findMany({
      orderBy: { createdAt: 'asc' },
    });
    expect(old.revokedAt).not.toBeNull();
    expect(old.replacedById).toBe(current.id);
    expect(current.revokedAt).toBeNull();
    expect(old.familyId).toBe(current.familyId);
  });

  it('needs a token', async () => {
    expect(await errorCode(auth.refresh(undefined))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
  });

  it('within the grace window, reusing the old token fails but keeps the session', async () => {
    const first = await auth.register(newUser());
    const next = await auth.refresh(first.refreshToken);

    expect(await errorCode(auth.refresh(first.refreshToken))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
    // The session survives: the new token still works.
    await expect(auth.refresh(next.refreshToken)).resolves.toBeDefined();
    expect(ended).toEqual([]);
  });

  it('after the grace window, reusing the old token revokes the whole session', async () => {
    const first = await auth.register(newUser());
    const next = await auth.refresh(first.refreshToken);
    // Pretend the rotation happened a minute ago (grace is 10 s).
    await prisma.$executeRawUnsafe(
      "UPDATE refresh_tokens SET revoked_at = now() - interval '60 seconds' WHERE revoked_at IS NOT NULL",
    );

    expect(await errorCode(auth.refresh(first.refreshToken))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
    // The theft itself ends the session (its sockets get closed).
    const session = { userId: first.user.id, sid: first.sid };
    expect(ended).toEqual([session]);

    expect(await errorCode(auth.refresh(next.refreshToken))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
    expect(
      await prisma.refreshToken.count({ where: { revokedAt: null } }),
    ).toBe(0);
    // Presenting another token of the revoked session counts as reuse too:
    // the same session is reported again, which is harmless.
    expect(ended.every((e) => e.sid === session.sid)).toBe(true);
  });

  it('lets exactly one of two concurrent refreshes rotate, without ending the session', async () => {
    const first = await auth.register(newUser());
    const results = await Promise.allSettled([
      auth.refresh(first.refreshToken),
      auth.refresh(first.refreshToken),
    ]);
    const winners = results.filter((r) => r.status === 'fulfilled');
    expect(winners).toHaveLength(1);
    const winner = (
      winners[0] as PromiseFulfilledResult<{ refreshToken: string }>
    ).value;
    await expect(auth.refresh(winner.refreshToken)).resolves.toBeDefined();
    expect(ended).toEqual([]);
  });

  it('rejects an expired refresh token', async () => {
    const first = await auth.register(newUser());
    await prisma.$executeRawUnsafe(
      "UPDATE refresh_tokens SET expires_at = now() - interval '1 second'",
    );
    expect(await errorCode(auth.refresh(first.refreshToken))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
  });
});

describe('logout', () => {
  it('revokes the session and reports it ended', async () => {
    const first = await auth.register(newUser());
    await expect(auth.logout(first.refreshToken)).resolves.toEqual({
      userId: first.user.id,
      sid: first.sid,
    });
    expect(ended).toEqual([{ userId: first.user.id, sid: first.sid }]);
    expect(await errorCode(auth.refresh(first.refreshToken))).toBe(
      'INVALID_REFRESH_TOKEN',
    );
  });

  it('succeeds without a token', async () => {
    await expect(auth.logout(undefined)).resolves.toBeNull();
  });
});
