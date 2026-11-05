import type { TestProject } from 'vitest/node';
import { ensureTestDatabase } from '../../tools/db/databases.mjs';
import { testRedisUrl } from '../../tools/db/env.mjs';

/**
 * Once per test run: auth_test and chat_test exist and are migrated. Their
 * URLs (and the test Redis) reach every test file through `inject()`, and
 * src/test-setup.ts points the app's env at them.
 */
export default async function setup(project: TestProject): Promise<void> {
  const [auth, chat] = await Promise.all([
    ensureTestDatabase('auth'),
    ensureTestDatabase('chat'),
  ]);
  project.provide('testEnv', {
    DATABASE_URL_AUTH: auth,
    DATABASE_URL_CHAT: chat,
    REDIS_URL: testRedisUrl(),
  });
}

declare module 'vitest' {
  export interface ProvidedContext {
    testEnv: {
      DATABASE_URL_AUTH: string;
      DATABASE_URL_CHAT: string;
      REDIS_URL: string;
    };
  }
}
