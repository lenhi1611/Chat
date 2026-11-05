import { DEV_ONLY_JWT_ACCESS_SECRET, validateEnv } from './env.schema';

/** The variables without a default. */
const required = {
  DATABASE_URL_AUTH: 'postgresql://u:p@localhost:5432/auth_db',
  DATABASE_URL_CHAT: 'postgresql://u:p@localhost:5432/chat_db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv(required)).toEqual({
      ...required,
      NODE_ENV: 'development',
      API_GATEWAY_PORT: 3000,
      CORS_ORIGINS: [
        'http://localhost:4200',
        'http://localhost:4201',
        'http://localhost:4202',
      ],
      WS_PATH: '/ws',
      WS_ALLOWED_ORIGINS: ['http://localhost:4200', 'http://localhost:4202'],
      WS_HEARTBEAT_MS: 30000,
      JWT_ACCESS_SECRET: DEV_ONLY_JWT_ACCESS_SECRET,
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TTL_DAYS: 7,
      REFRESH_REUSE_GRACE_SECONDS: 10,
      WS_TICKET_TTL_SECONDS: 30,
      COOKIE_SECURE: false,
    });
  });

  it('parses a comma-separated origin list', () => {
    const env = validateEnv({
      ...required,
      CORS_ORIGINS: 'http://localhost:4200, http://localhost:4201',
    });
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:4200',
      'http://localhost:4201',
    ]);
  });

  it('parses numbers and booleans from strings', () => {
    const env = validateEnv({
      ...required,
      JWT_ACCESS_TTL_SECONDS: '60',
      REFRESH_REUSE_GRACE_SECONDS: '0',
      COOKIE_SECURE: 'true',
    });
    expect(env).toMatchObject({
      JWT_ACCESS_TTL_SECONDS: 60,
      REFRESH_REUSE_GRACE_SECONDS: 0,
      COOKIE_SECURE: true,
    });
  });

  it('requires the database and Redis URLs, with the right scheme', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL_AUTH/);
    expect(() =>
      validateEnv({ ...required, DATABASE_URL_CHAT: 'mysql://h/chat' }),
    ).toThrow(/DATABASE_URL_CHAT/);
    expect(() =>
      validateEnv({ ...required, REDIS_URL: 'http://localhost:6379' }),
    ).toThrow(/REDIS_URL/);
  });

  it('requires a JWT secret of at least 32 characters in production', () => {
    expect(() => validateEnv({ ...required, NODE_ENV: 'production' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
    expect(() =>
      validateEnv({ ...required, JWT_ACCESS_SECRET: 'short' }),
    ).toThrow(/JWT_ACCESS_SECRET/);
    const secret = 'x'.repeat(32);
    expect(
      validateEnv({
        ...required,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: secret,
      }).JWT_ACCESS_SECRET,
    ).toBe(secret);
  });

  it('rejects invalid values', () => {
    expect(() => validateEnv({ ...required, API_GATEWAY_PORT: 'abc' })).toThrow(
      /API_GATEWAY_PORT/,
    );
    expect(() =>
      validateEnv({ ...required, CORS_ORIGINS: 'not-a-url' }),
    ).toThrow(/CORS_ORIGINS/);
    expect(() => validateEnv({ ...required, WS_PATH: 'ws' })).toThrow(
      /WS_PATH/,
    );
    expect(() =>
      validateEnv({ ...required, WS_ALLOWED_ORIGINS: 'evil' }),
    ).toThrow(/WS_ALLOWED_ORIGINS/);
    expect(() => validateEnv({ ...required, WS_HEARTBEAT_MS: '0' })).toThrow(
      /WS_HEARTBEAT_MS/,
    );
    expect(() =>
      validateEnv({ ...required, WS_TICKET_TTL_SECONDS: '0' }),
    ).toThrow(/WS_TICKET_TTL_SECONDS/);
    expect(() => validateEnv({ ...required, COOKIE_SECURE: 'maybe' })).toThrow(
      /COOKIE_SECURE/,
    );
  });
});
