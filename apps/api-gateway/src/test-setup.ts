import { testRabbitUrl } from '../../../tools/db/env.mjs';

// AppModule reads these (process.env wins over .env in @nestjs/config). The
// gateway opens no database or Redis connection: the URLs below only satisfy
// the env schema until those variables are removed from it (phase 3, step 9).
process.env['NODE_ENV'] = 'test';
process.env['RABBITMQ_URL'] = testRabbitUrl();
process.env['JWT_ACCESS_SECRET'] = 'a-test-secret-that-is-long-enough-123456';
process.env['WS_ALLOWED_ORIGINS'] = 'http://localhost:4200';
process.env['DATABASE_URL_AUTH'] ??= 'postgresql://unused@localhost:1/unused';
process.env['DATABASE_URL_CHAT'] ??= 'postgresql://unused@localhost:1/unused';
process.env['REDIS_URL'] ??= 'redis://localhost:1';
