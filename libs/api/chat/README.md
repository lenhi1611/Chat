# api-chat (`domain:chat`)

Conversations, members and messages, stored in **chat_db** (Prisma schema in
`prisma/`). User ids are plain uuids: users live in auth_db, with no foreign key
across databases. May import only `@realtime-chat/contracts` and
`domain:infra` libs, never `api-auth`.

- Generate the client: `npm run db:generate` (output `src/generated`, git-ignored)
- New migration: `npx prisma migrate dev --config libs/api/chat/prisma.config.ts --name <change>`
- Tests: `npx nx test api-chat` (needs `npm run infra:up`; uses `chat_test`)
