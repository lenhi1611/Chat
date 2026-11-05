import { createHash, createHmac } from 'node:crypto';
import {
  type ApiError,
  type AuthResponse,
  authResponseSchema,
  type CurrentUser,
  REFRESH_COOKIE,
  type UserSummary,
  type WsTicketResponse,
} from '@realtime-chat/contracts';
import { WsTicketService } from '@realtime-chat/api-auth';
import {
  http,
  type HttpResult,
  startTestApp,
  type TestApp,
  truncateAuth,
  withDb,
} from '../testing/test-app';
import { TEST_JWT_SECRET } from '../test-setup';

/*
 * The auth REST API end to end: real AppModule, auth_test database, Redis
 * database 15. Each test starts from empty auth tables.
 */

let t: TestApp;

beforeAll(async () => {
  t = await startTestApp();
});
afterAll(() => t.close());
beforeEach(() => truncateAuth());

const authDb = <T>(run: Parameters<typeof withDb<T>>[1]) =>
  withDb(process.env['DATABASE_URL_AUTH'] ?? '', run);

const call = <T = unknown>(
  method: string,
  path: string,
  options?: Parameters<typeof http>[3],
) => http<T>(t.apiUrl, method, path, options);

let seq = 0;
function newUser(overrides: Partial<Record<string, string>> = {}) {
  seq += 1;
  return {
    email: `user${seq}@example.test`,
    username: `user_${seq}`,
    displayName: `User ${seq}`,
    password: `pass-${seq}-correct-horse`,
    ...overrides,
  };
}

/** The refresh cookie of a response, with its attributes. */
function refreshCookie(result: HttpResult) {
  const raw = result.setCookies.find((c) =>
    c.startsWith(`${REFRESH_COOKIE.name}=`),
  );
  if (!raw) return null;
  const [pair, ...attributes] = raw.split(';').map((part) => part.trim());
  return {
    value: decodeURIComponent(pair.slice(REFRESH_COOKIE.name.length + 1)),
    attributes: attributes.map((a) => a.toLowerCase()),
    header: `${REFRESH_COOKIE.name}=${pair.slice(REFRESH_COOKIE.name.length + 1)}`,
  };
}

async function register(user = newUser()) {
  const result = await call<AuthResponse>('POST', 'auth/register', {
    body: user,
  });
  expect(result.status).toBe(201);
  const cookie = refreshCookie(result);
  if (!cookie) throw new Error('no refresh cookie');
  return { user, auth: result.body, cookie };
}

const errorCode = (result: HttpResult) => (result.body as ApiError).error.code;

function jwt(header: object, payload: object, secret = TEST_JWT_SECRET) {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${part(header)}.${part(payload)}`;
  const algorithm =
    (header as { alg: string }).alg === 'HS512' ? 'sha512' : 'sha256';
  const signature =
    (header as { alg: string }).alg === 'none'
      ? ''
      : createHmac(algorithm, secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

describe('register', () => {
  it('creates the user, returns an access token and sets the refresh cookie', async () => {
    const user = newUser({
      email: '  New.User@Example.TEST ',
      username: 'New_User',
    });
    const result = await call<AuthResponse>('POST', 'auth/register', {
      body: user,
    });

    expect(result.status).toBe(201);
    expect(authResponseSchema.safeParse(result.body).success).toBe(true);
    expect(result.body).toMatchObject({
      expiresIn: 900,
      user: {
        email: 'new.user@example.test',
        username: 'new_user',
        displayName: user.displayName,
      },
    });

    const cookie = refreshCookie(result);
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining([
        'httponly',
        'samesite=strict',
        `path=${REFRESH_COOKIE.path}`,
        expect.stringMatching(/^expires=/),
      ]),
    );
    // COOKIE_SECURE=false in tests (see refresh-cookie.spec.ts for true).
    expect(cookie?.attributes).not.toContain('secure');
    // The refresh token is not in the JSON body.
    expect(JSON.stringify(result.body)).not.toContain(cookie?.value);
  });

  it('stores an argon2id hash, never the password, and logs neither', async () => {
    const { user, cookie } = await register();
    const row = await authDb((db) =>
      db.query('SELECT password_hash FROM users WHERE email = $1', [
        user.email,
      ]),
    );
    const hash: string = row.rows[0].password_hash;
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain(user.password);

    await call('POST', 'auth/login', {
      body: { email: user.email, password: 'a-wrong-password' },
    });
    const logs = t.logger.lines.join('\n');
    expect(logs).not.toContain(user.password);
    expect(logs).not.toContain('a-wrong-password');
    expect(logs).not.toContain(cookie.value);
  });

  it('stores only a SHA-256 hash of the refresh token', async () => {
    const { cookie } = await register();
    const rows = await authDb((db) =>
      db.query('SELECT token_hash FROM refresh_tokens'),
    );
    expect(rows.rows).toEqual([
      { token_hash: createHash('sha256').update(cookie.value).digest('hex') },
    ]);
  });

  it('rejects an invalid body with VALIDATION_FAILED and field details', async () => {
    const result = await call<ApiError>('POST', 'auth/register', {
      body: {
        email: 'nope',
        username: 'a',
        displayName: '',
        password: 'short',
      },
    });
    expect(result.status).toBe(400);
    expect(result.body.error.code).toBe('VALIDATION_FAILED');
    expect(result.body.error.details?.map((d) => d.path).sort()).toEqual([
      'displayName',
      'email',
      'password',
      'username',
    ]);
  });

  it('rejects a malformed JSON body in the same format', async () => {
    const result = await call('POST', 'auth/register', { raw: '{"email":' });
    expect(result.status).toBe(400);
    expect(errorCode(result)).toBe('VALIDATION_FAILED');
  });

  it('rejects a taken email (case-insensitive) or username with 409', async () => {
    const { user } = await register();
    const sameEmail = await call('POST', 'auth/register', {
      body: newUser({ email: user.email.toUpperCase() }),
    });
    expect(sameEmail.status).toBe(409);
    expect(errorCode(sameEmail)).toBe('EMAIL_TAKEN');

    const sameUsername = await call('POST', 'auth/register', {
      body: newUser({ username: user.username }),
    });
    expect(sameUsername.status).toBe(409);
    expect(errorCode(sameUsername)).toBe('USERNAME_TAKEN');
  });
});

describe('login', () => {
  it('signs in with the right password (email in any case)', async () => {
    const { user } = await register();
    const result = await call<AuthResponse>('POST', 'auth/login', {
      body: { email: user.email.toUpperCase(), password: user.password },
    });
    expect(result.status).toBe(200);
    expect(result.body.user.email).toBe(user.email);
    expect(refreshCookie(result)).not.toBeNull();
  });

  it('answers a wrong password and an unknown email identically', async () => {
    const { user } = await register();
    const wrongPassword = await call('POST', 'auth/login', {
      body: { email: user.email, password: 'not-the-password' },
    });
    const unknownEmail = await call('POST', 'auth/login', {
      body: { email: 'nobody@example.test', password: 'not-the-password' },
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(errorCode(wrongPassword)).toBe('INVALID_CREDENTIALS');
    expect(refreshCookie(wrongPassword)).toBeNull();
  });

  it('spends comparable time on an unknown email (a hash is verified)', async () => {
    const { user } = await register();
    const time = async (email: string) => {
      const start = performance.now();
      await call('POST', 'auth/login', {
        body: { email, password: 'x-wrong-x' },
      });
      return performance.now() - start;
    };
    await time('warmup@example.test'); // dummy hash is created lazily
    const known = await time(user.email);
    const unknown = await time('nobody@example.test');
    // argon2 dominates both (tens of ms); no early return for unknown emails.
    expect(unknown).toBeGreaterThan(known / 3);
  });
});

describe('access tokens', () => {
  it('authenticate GET /auth/me', async () => {
    const { auth } = await register();
    const me = await call<CurrentUser>('GET', 'auth/me', {
      token: auth.accessToken,
    });
    expect(me.status).toBe(200);
    expect(me.body).toEqual(auth.user);
  });

  it('are required on every non-public route', async () => {
    for (const [method, path] of [
      ['GET', 'auth/me'],
      ['POST', 'auth/ws-ticket'],
      ['GET', 'users/search?q=ab'],
    ]) {
      const result = await call(method, path);
      expect(result.status, `${method} ${path}`).toBe(401);
      expect(errorCode(result)).toBe('UNAUTHENTICATED');
    }
    expect((await call('GET', 'health')).status).toBe(200);
  });

  it('are rejected when expired, badly signed, alg=none or another algorithm', async () => {
    const { auth } = await register();
    const { sub, sid } = JSON.parse(
      Buffer.from(auth.accessToken.split('.')[1], 'base64url').toString(),
    );
    const now = Math.floor(Date.now() / 1000);
    const cases: [string, string, string][] = [
      [
        'expired',
        jwt(
          { alg: 'HS256', typ: 'JWT' },
          { sub, sid, iat: now - 1000, exp: now - 10 },
        ),
        'TOKEN_EXPIRED',
      ],
      [
        'wrong key',
        jwt(
          { alg: 'HS256', typ: 'JWT' },
          { sub, sid, exp: now + 60 },
          'x'.repeat(40),
        ),
        'UNAUTHENTICATED',
      ],
      [
        'alg none',
        jwt({ alg: 'none', typ: 'JWT' }, { sub, sid, exp: now + 60 }),
        'UNAUTHENTICATED',
      ],
      [
        'HS512',
        jwt({ alg: 'HS512', typ: 'JWT' }, { sub, sid, exp: now + 60 }),
        'UNAUTHENTICATED',
      ],
      ['tampered', auth.accessToken.slice(0, -2) + 'xx', 'UNAUTHENTICATED'],
    ];
    for (const [label, token, code] of cases) {
      const result = await call('GET', 'auth/me', { token });
      expect(result.status, label).toBe(401);
      expect(errorCode(result), label).toBe(code);
    }
  });
});

describe('refresh', () => {
  it('rotates the refresh token and keeps the same session', async () => {
    const { auth, cookie } = await register();
    const result = await call<AuthResponse>('POST', 'auth/refresh', {
      cookie: cookie.header,
    });
    expect(result.status).toBe(200);
    const next = refreshCookie(result);
    expect(next?.value).not.toBe(cookie.value);

    const sid = (token: string) =>
      JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sid;
    expect(sid(result.body.accessToken)).toBe(sid(auth.accessToken));
    expect(
      (await call('GET', 'auth/me', { token: result.body.accessToken })).status,
    ).toBe(200);

    const rows = await authDb((db) =>
      db.query(
        'SELECT token_hash, revoked_at, replaced_by_id, family_id FROM refresh_tokens ORDER BY created_at',
      ),
    );
    expect(rows.rows).toHaveLength(2);
    const [old, current] = rows.rows;
    expect(old.revoked_at).not.toBeNull();
    expect(old.replaced_by_id).not.toBeNull();
    expect(current.revoked_at).toBeNull();
    expect(old.family_id).toBe(current.family_id);
  });

  it('needs the cookie', async () => {
    const result = await call('POST', 'auth/refresh');
    expect(result.status).toBe(401);
    expect(errorCode(result)).toBe('INVALID_REFRESH_TOKEN');
  });

  it('within the grace window, reusing the old token fails but keeps the session', async () => {
    const { cookie } = await register();
    const rotated = await call('POST', 'auth/refresh', {
      cookie: cookie.header,
    });
    const next = refreshCookie(rotated);

    const reuse = await call('POST', 'auth/refresh', { cookie: cookie.header });
    expect(reuse.status).toBe(401);
    expect(errorCode(reuse)).toBe('INVALID_REFRESH_TOKEN');

    // The session survives: the new token still works.
    const again = await call('POST', 'auth/refresh', { cookie: next?.header });
    expect(again.status).toBe(200);
  });

  it('after the grace window, reusing the old token revokes the whole session', async () => {
    const { cookie } = await register();
    const rotated = await call('POST', 'auth/refresh', {
      cookie: cookie.header,
    });
    const next = refreshCookie(rotated);
    // Pretend the rotation happened a minute ago (grace is 10 s).
    await authDb((db) =>
      db.query(
        "UPDATE refresh_tokens SET revoked_at = now() - interval '60 seconds' WHERE revoked_at IS NOT NULL",
      ),
    );

    const theft = await call('POST', 'auth/refresh', { cookie: cookie.header });
    expect(theft.status).toBe(401);

    const legit = await call('POST', 'auth/refresh', { cookie: next?.header });
    expect(legit.status).toBe(401);
    expect(errorCode(legit)).toBe('INVALID_REFRESH_TOKEN');
    const active = await authDb((db) =>
      db.query(
        'SELECT count(*)::int AS n FROM refresh_tokens WHERE revoked_at IS NULL',
      ),
    );
    expect(active.rows[0].n).toBe(0);
  });

  it('lets exactly one of two concurrent refreshes rotate, without ending the session', async () => {
    const { cookie } = await register();
    const results = await Promise.all([
      call('POST', 'auth/refresh', { cookie: cookie.header }),
      call('POST', 'auth/refresh', { cookie: cookie.header }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);
    const winner = results.find((r) => r.status === 200);
    const again = await call('POST', 'auth/refresh', {
      cookie: refreshCookie(winner as HttpResult)?.header,
    });
    expect(again.status).toBe(200);
  });

  it('rejects an expired refresh token', async () => {
    const { cookie } = await register();
    await authDb((db) =>
      db.query(
        "UPDATE refresh_tokens SET expires_at = now() - interval '1 second'",
      ),
    );
    const result = await call('POST', 'auth/refresh', {
      cookie: cookie.header,
    });
    expect(result.status).toBe(401);
  });
});

describe('logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { cookie } = await register();
    const result = await call('POST', 'auth/logout', { cookie: cookie.header });
    expect(result.status).toBe(204);
    const cleared = result.setCookies.find((c) =>
      c.startsWith(`${REFRESH_COOKIE.name}=;`),
    );
    expect(cleared).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect(cleared?.toLowerCase()).toContain(`path=${REFRESH_COOKIE.path}`);

    const refresh = await call('POST', 'auth/refresh', {
      cookie: cookie.header,
    });
    expect(refresh.status).toBe(401);
  });

  it('succeeds without a cookie', async () => {
    expect((await call('POST', 'auth/logout')).status).toBe(204);
  });
});

describe('ws-ticket', () => {
  it('issues a single-use ticket for the caller and session', async () => {
    const { auth } = await register();
    const result = await call<WsTicketResponse>('POST', 'auth/ws-ticket', {
      token: auth.accessToken,
    });
    expect(result.status).toBe(200);
    expect(result.body.expiresIn).toBe(30);

    const tickets = t.app.get(WsTicketService);
    const { sid } = JSON.parse(
      Buffer.from(auth.accessToken.split('.')[1], 'base64url').toString(),
    );
    await expect(tickets.consume(result.body.ticket)).resolves.toEqual({
      userId: auth.user.id,
      sid,
    });
    await expect(tickets.consume(result.body.ticket)).resolves.toBeNull();
  });
});

describe('users/search', () => {
  it('finds other users by username prefix', async () => {
    const { auth } = await register(newUser({ username: 'searcher' }));
    await register(newUser({ username: 'sea_lion' }));
    await register(newUser({ username: 'other' }));
    const result = await call<UserSummary[]>('GET', 'users/search?q=SEA', {
      token: auth.accessToken,
    });
    expect(result.status).toBe(200);
    expect(result.body.map((u) => u.username)).toEqual(['sea_lion']);
    expect(Object.keys(result.body[0]).sort()).toEqual([
      'displayName',
      'id',
      'username',
    ]);
  });

  it('needs at least 2 characters', async () => {
    const { auth } = await register();
    const result = await call('GET', 'users/search?q=a', {
      token: auth.accessToken,
    });
    expect(result.status).toBe(400);
    expect(errorCode(result)).toBe('VALIDATION_FAILED');
  });
});

describe('error format', () => {
  it('applies to unknown routes too (404 NOT_FOUND, before any guard)', async () => {
    const result = await call<ApiError>('GET', 'does-not-exist');
    expect(result.status).toBe(404);
    expect(result.body).toEqual({
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });
});
