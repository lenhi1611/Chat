import { inject } from 'vitest';

// Runs before every test file. process.env wins over .env in ConfigModule, so
// an AppModule created by a test talks to auth_test / chat_test / Redis db 15,
// never to the dev data.
Object.assign(process.env, inject('testEnv'));
