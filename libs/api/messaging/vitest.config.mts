import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/api/messaging',
  // NestJS DI relies on emitDecoratorMetadata, which esbuild does not support.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-messaging',
    watch: false,
    // Integration tests talk to a real RabbitMQ (npm run infra:up).
    testTimeout: 30_000,
    hookTimeout: 30_000,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/api/messaging',
      provider: 'v8' as const,
    },
  },
}));
