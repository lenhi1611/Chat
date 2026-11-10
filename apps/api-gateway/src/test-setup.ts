import { testRabbitUrl } from '../../../tools/db/env.mjs';

// AppModule reads these (process.env wins over .env in @nestjs/config).
process.env['NODE_ENV'] = 'test';
process.env['RABBITMQ_URL'] = testRabbitUrl();
process.env['JWT_ACCESS_SECRET'] = 'a-test-secret-that-is-long-enough-123456';
process.env['WS_ALLOWED_ORIGINS'] = 'http://localhost:4200';
