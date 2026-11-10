import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/api-gateway',
  // NestJS DI relies on emitDecoratorMetadata, which esbuild does not support.
  // SWC compiles the test sources (and emits decorator metadata) instead.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-gateway',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Integration tests need RabbitMQ (npm run infra:up).
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/api-gateway',
      provider: 'v8' as const,
    },
  },
}));
