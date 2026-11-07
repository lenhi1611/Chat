import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/shared/auth',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'auth',
    watch: false,
    // No spec files at the moment.
    passWithNoTests: true,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/shared/auth',
      provider: 'v8' as const,
    },
  },
}));
