import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/auth-service',
  // NestJS DI relies on emitDecoratorMetadata, which esbuild does not support.
  // SWC compiles the test sources (and emits decorator metadata) instead.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'auth-service',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // auth_test (Postgres), Redis db 15 and RabbitMQ: npm run infra:up.
    globalSetup: ['./vitest.global-setup.mts'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/auth-service',
      provider: 'v8' as const,
    },
  },
}));
