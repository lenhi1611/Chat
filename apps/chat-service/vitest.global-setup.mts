import type { TestProject } from 'vitest/node';
import { ensureTestDatabase } from '../../tools/db/databases.mjs';

/** Runs once per test run, before any test file: chat_test exists and is migrated. */
export default async function setup(project: TestProject): Promise<void> {
  project.provide('chatDatabaseUrl', await ensureTestDatabase('chat'));
}

declare module 'vitest' {
  export interface ProvidedContext {
    chatDatabaseUrl: string;
  }
}
