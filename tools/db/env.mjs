// Environment helpers for database tooling (Prisma configs, npm scripts,
// Vitest global setup). Plain .mjs so Node runs it without a build step.
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Workspace root: tools/db/../.. */
export const WORKSPACE_ROOT = join(import.meta.dirname, '..', '..');

/**
 * Loads the workspace `.env` into process.env for tools that do not read it
 * themselves. Variables already set win, so a caller can point a command at
 * another database: `DATABASE_URL_AUTH=… npx prisma …`.
 */
export function loadWorkspaceEnv() {
  const file = join(WORKSPACE_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

/**
 * Redis used by tests: `TEST_REDIS_URL` when set, otherwise `REDIS_URL` with
 * logical database 15, so tests never touch keys of the dev database 0.
 */
export function testRedisUrl() {
  loadWorkspaceEnv();
  if (process.env['TEST_REDIS_URL']) return process.env['TEST_REDIS_URL'];
  const base = process.env['REDIS_URL'];
  if (!base) throw new Error('REDIS_URL is not set (see .env.example)');
  const url = new URL(base);
  url.pathname = '/15';
  return url.toString();
}

/**
 * RabbitMQ used by tests: `TEST_RABBITMQ_URL` when set, otherwise
 * `RABBITMQ_URL`. Tests isolate themselves with randomly prefixed exchange
 * and queue names (see libs/api/messaging), and delete them afterwards.
 */
export function testRabbitUrl() {
  loadWorkspaceEnv();
  const url = process.env['TEST_RABBITMQ_URL'] ?? process.env['RABBITMQ_URL'];
  if (!url) throw new Error('RABBITMQ_URL is not set (see .env.example)');
  return url;
}
