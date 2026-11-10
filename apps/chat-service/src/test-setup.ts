import { inject } from 'vitest';
import { testRabbitUrl } from '../../../tools/db/env.mjs';

// Point AppModule at the test infrastructure. process.env wins over .env in
// @nestjs/config, so the dev database is never touched.
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_URL_CHAT'] = inject('chatDatabaseUrl');
process.env['RABBITMQ_URL'] = testRabbitUrl();
process.env['CHAT_COMMAND_MAX_ATTEMPTS'] = '3';
