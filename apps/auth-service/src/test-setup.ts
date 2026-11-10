import { inject } from 'vitest';
import { testRabbitUrl, testRedisUrl } from '../../../tools/db/env.mjs';

// Point AppModule at the test infrastructure. process.env wins over .env in
// @nestjs/config, so the dev databases are never touched.
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL_AUTH'] = inject('authDatabaseUrl');
process.env['REDIS_URL'] = testRedisUrl();
process.env['RABBITMQ_URL'] = testRabbitUrl();
process.env['JWT_ACCESS_SECRET'] = 'a-test-secret-that-is-long-enough-123456';
