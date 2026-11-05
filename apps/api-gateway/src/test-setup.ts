import { inject } from 'vitest';

/** Access-token key of every app created by a test (see auth tests). */
export const TEST_JWT_SECRET = 'test-only-jwt-secret-not-used-anywhere-else';

// Runs before every test file. process.env wins over .env in ConfigModule, so
// an AppModule created by a test talks to auth_test / chat_test / Redis db 15,
// never to the dev data, and signs tokens with a known key.
Object.assign(process.env, inject('testEnv'), {
  JWT_ACCESS_SECRET: TEST_JWT_SECRET,
});
