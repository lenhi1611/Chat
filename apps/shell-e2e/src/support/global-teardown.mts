import pg from 'pg';
import { loadWorkspaceEnv } from '../../../../tools/db/env.mjs';

/** Every account the tests (and the manual probes) create uses this domain. */
const TEST_EMAILS = '%@example.test';

/**
 * Runs once after the e2e suite: deletes the accounts the tests registered
 * (`@example.test`) and what belongs to them, in auth_db and chat_db, i.e.
 * the databases of the stack under test (DATABASE_URL_* from .env).
 * Set E2E_KEEP_DATA=1 to keep them (e.g. to look at a failure).
 *
 * chat_db first: if it fails, the users still exist and a rerun can find
 * their ids again.
 */
export default async function globalTeardown(): Promise<void> {
  if (process.env['E2E_KEEP_DATA'] === '1') return;
  loadWorkspaceEnv();
  const authUrl = process.env['DATABASE_URL_AUTH'];
  const chatUrl = process.env['DATABASE_URL_CHAT'];
  if (!authUrl || !chatUrl) {
    console.warn('[e2e cleanup] DATABASE_URL_AUTH/CHAT not set: skipped');
    return;
  }

  const auth = new pg.Client({ connectionString: authUrl });
  const chat = new pg.Client({ connectionString: chatUrl });
  await auth.connect();
  await chat.connect();
  try {
    const { rows } = await auth.query<{ id: string }>(
      'SELECT id FROM users WHERE email LIKE $1',
      [TEST_EMAILS],
    );
    const ids = rows.map((row) => row.id);
    if (ids.length === 0) return;

    await chat.query('BEGIN');
    // Conversations made only of test users (their messages and members
    // go with them, ON DELETE CASCADE)…
    const conversations = await chat.query(
      `DELETE FROM conversations c
        WHERE NOT EXISTS (
          SELECT 1 FROM conversation_members m
           WHERE m.conversation_id = c.id AND NOT (m.user_id = ANY($1::uuid[])))`,
      [ids],
    );
    // …and test users' seats in any other conversation, and their copies.
    await chat.query(
      'DELETE FROM conversation_members WHERE user_id = ANY($1::uuid[])',
      [ids],
    );
    await chat.query('DELETE FROM chat_users WHERE id = ANY($1::uuid[])', [
      ids,
    ]);
    await chat.query('COMMIT');

    // Refresh tokens go with their user (ON DELETE CASCADE).
    await auth.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
    console.log(
      `[e2e cleanup] removed ${ids.length} test user(s) and ${conversations.rowCount} conversation(s)`,
    );
  } catch (error) {
    await chat.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await auth.end();
    await chat.end();
  }
}
