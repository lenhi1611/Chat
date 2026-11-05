import { defineConfig } from 'prisma/config';
import { loadWorkspaceEnv } from '../../../tools/db/env.mjs';

// Used by every Prisma CLI command for auth_db, e.g.
//   npx prisma migrate dev --config libs/api/auth/prisma.config.ts --name <change>
// Paths below are relative to this file.
loadWorkspaceEnv();

const url = process.env['DATABASE_URL_AUTH'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  // `prisma generate` needs no database, so a missing URL only fails the
  // commands that connect (migrate, studio…), with Prisma's own error.
  ...(url ? { datasource: { url } } : {}),
});
