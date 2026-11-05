import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/api/chat',
  // NestJS DI relies on emitDecoratorMetadata, which esbuild does not support.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-chat',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Creates and migrates chat_test once per run (needs `npm run infra:up`).
    globalSetup: ['./vitest.global-setup.mts'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/api/chat',
      provider: 'v8' as const,
    },
  },
}));
