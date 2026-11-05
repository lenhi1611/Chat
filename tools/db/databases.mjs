// The two Prisma-managed databases, their dev URLs and their test twins.
//
//   npm run db:migrate      apply committed migrations to auth_db and chat_db
//   npm run db:reset        drop all data of both dev databases, re-migrate
//   npm run db:test:ensure  create auth_test / chat_test if missing, migrate
//
// Integration tests call ensureTestDatabase() from their Vitest global setup.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { loadWorkspaceEnv, WORKSPACE_ROOT } from './env.mjs';

/** @typedef {'auth' | 'chat'} DbName */

export const DATABASES = {
  auth: { envVar: 'DATABASE_URL_AUTH', testDatabase: 'auth_test' },
  chat: { envVar: 'DATABASE_URL_CHAT', testDatabase: 'chat_test' },
};

/** @param {DbName} name */
export function prismaConfigPath(name) {
  return join(WORKSPACE_ROOT, 'libs', 'api', name, 'prisma.config.ts');
}

/** @param {DbName} name */
export function devDatabaseUrl(name) {
  loadWorkspaceEnv();
  const { envVar } = DATABASES[name];
  const url = process.env[envVar];
  if (!url) {
    throw new Error(`${envVar} is not set (copy it from .env.example to .env)`);
  }
  return url;
}

/**
 * Test database URL: `TEST_DATABASE_URL_AUTH` / `_CHAT` when set, otherwise
 * the dev URL with the database renamed (auth_db → auth_test). Same server
 * and credentials, never the dev data.
 * @param {DbName} name
 */
export function testDatabaseUrl(name) {
  loadWorkspaceEnv();
  const { envVar, testDatabase } = DATABASES[name];
  const explicit = process.env[`TEST_${envVar}`];
  if (explicit) return explicit;
  return withDatabase(devDatabaseUrl(name), testDatabase);
}

/** @param {string} url @param {string} database */
function withDatabase(url, database) {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/** Creates `database` on the server of `url` unless it exists. */
export async function ensureDatabaseExists(url) {
  const database = new URL(url).pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(database)) {
    throw new Error(`Refusing to create database with name "${database}"`);
  }
  const admin = new pg.Client({
    connectionString: withDatabase(url, 'postgres'),
  });
  await admin.connect();
  try {
    const { rowCount } = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [database],
    );
    if (!rowCount) {
      try {
        await admin.query(`CREATE DATABASE "${database}"`);
      } catch (error) {
        // Another process created it in the meantime (parallel test runs).
        if (/** @type {{ code?: string }} */ (error).code !== '42P04')
          throw error;
      }
    }
  } finally {
    await admin.end();
  }
}

/**
 * Runs a Prisma CLI command for one database with its URL overridden.
 * @param {DbName} name @param {string[]} args @param {string} url
 */
export function prisma(name, args, url) {
  execFileSync(
    process.execPath,
    [
      join(WORKSPACE_ROOT, 'node_modules', 'prisma', 'build', 'index.js'),
      ...args,
      '--config',
      prismaConfigPath(name),
    ],
    {
      cwd: WORKSPACE_ROOT,
      env: { ...process.env, [DATABASES[name].envVar]: url },
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
}

/**
 * Makes the test database of `name` exist and carry every committed
 * migration. Idempotent and safe to call from parallel test runs (Prisma takes
 * an advisory lock while migrating). Returns its URL.
 * @param {DbName} name
 */
export async function ensureTestDatabase(name) {
  const url = testDatabaseUrl(name);
  await ensureDatabaseExists(url);
  prisma(name, ['migrate', 'deploy'], url);
  return url;
}

// --- CLI ---------------------------------------------------------------------

const commands = {
  async migrate() {
    for (const name of /** @type {DbName[]} */ (['auth', 'chat'])) {
      prisma(name, ['migrate', 'deploy'], devDatabaseUrl(name));
    }
  },
  async reset() {
    for (const name of /** @type {DbName[]} */ (['auth', 'chat'])) {
      prisma(name, ['migrate', 'reset', '--force'], devDatabaseUrl(name));
    }
  },
  async 'test:ensure'() {
    for (const name of /** @type {DbName[]} */ (['auth', 'chat'])) {
      await ensureTestDatabase(name);
      // The URL carries the password: print the database name only.
      console.log(`${DATABASES[name].testDatabase}: ready`);
    }
  },
};

if (process.argv[1] === import.meta.filename) {
  const command = process.argv[2];
  const run = commands[/** @type {keyof typeof commands} */ (command)];
  if (!run) {
    console.error(
      `Usage: node tools/db/databases.mjs <${Object.keys(commands).join('|')}>`,
    );
    process.exit(2);
  }
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
