import { validateEnv } from './env.schema';

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv({})).toEqual({
      NODE_ENV: 'development',
      API_GATEWAY_PORT: 3000,
      CORS_ORIGINS: ['http://localhost:4200'],
    });
  });

  it('parses a comma-separated origin list', () => {
    const env = validateEnv({
      CORS_ORIGINS: 'http://localhost:4200, http://localhost:4201',
    });
    expect(env.CORS_ORIGINS).toEqual([
      'http://localhost:4200',
      'http://localhost:4201',
    ]);
  });

  it('rejects invalid values', () => {
    expect(() => validateEnv({ API_GATEWAY_PORT: 'abc' })).toThrow(
      /API_GATEWAY_PORT/,
    );
    expect(() => validateEnv({ CORS_ORIGINS: 'not-a-url' })).toThrow(
      /CORS_ORIGINS/,
    );
  });
});
