# api-redis (`domain:infra`)

`RedisModule.forRootAsync({ useFactory })`: one shared ioredis connection,
registered once at the root (global module), closed on application shutdown.
Inject it with `@Inject(REDIS_CLIENT) redis: Redis`.

Tests: `npx nx test api-redis` (needs `npm run infra:up`; uses Redis database 15).
