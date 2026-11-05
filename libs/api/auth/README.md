# api-auth (`domain:auth`)

Users and login sessions, stored in **auth_db** (Prisma schema in `prisma/`).
Only this library reads or writes those tables; other domains go through its
services. May import only `@realtime-chat/contracts` and `domain:infra` libs.

- Generate the client: `npm run db:generate` (output `src/generated`, git-ignored)
- New migration: `npx prisma migrate dev --config libs/api/auth/prisma.config.ts --name <change>`
- Tests: `npx nx test api-auth` (needs `npm run infra:up`; uses `auth_test`)
