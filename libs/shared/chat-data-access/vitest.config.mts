import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/shared/chat-data-access',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'chat-data-access',
    watch: false,
    // No spec files at the moment.
    passWithNoTests: true,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/shared/chat-data-access',
      provider: 'v8' as const,
    },
  },
}));
