import { defineConfig, devices } from '@playwright/test';
import { nxE2EPreset } from '@nx/playwright/preset';
import { workspaceRoot } from '@nx/devkit';

// Fixed ports (see README). Not Nx's ready-URL helper: under `nx e2e` it
// rewrites the port to whichever of the three serve tasks reported ready,
// which is not necessarily the shell. Set BASE_URL to test a deployed shell.
const baseURL = process.env['BASE_URL'] || 'http://localhost:4200';

/**
 * End-to-end tests for the whole stack: shell (4200) loads the mfe-auth
 * (4201) and mfe-chat (4202) remotes, which talk to the api-gateway (3000,
 * REST + WebSocket), which talks to auth-service and chat-service over
 * RabbitMQ (Postgres, Redis and RabbitMQ from docker compose).
 *
 * Every test registers its own users (`e2e_…`), so tests do not share state;
 * those accounts stay in the database the gateway uses.
 *
 * Locally, servers that are already running (e.g. `npm run serve:all`) are
 * reused; otherwise Playwright starts each one and waits for its URL.
 *
 * See https://playwright.dev/docs/test-configuration.
 * Generated as a .mts file so Node forces ESM regardless of workspace `type`.
 */
export default defineConfig({
  ...nxE2EPreset(import.meta.dirname, { testDir: './src' }),
  // Tests are isolated by their own users, but several browsers per test on
  // dev servers is heavy: keep one worker for stable timings.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  webServer: [
    // The services have no HTTP port: the gateway's health check answers
    // 200 only once RabbitMQ and both services respond (503 until then).
    ...['auth-service', 'chat-service', 'api-gateway'].map((project) => ({
      command: `npx nx serve ${project}`,
      url: 'http://localhost:3000/api/health',
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 180_000,
    })),
    {
      command: 'npx nx serve mfe-auth',
      url: 'http://localhost:4201/remoteEntry.json',
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 180_000,
    },
    {
      command: 'npx nx serve mfe-chat',
      url: 'http://localhost:4202/remoteEntry.json',
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 180_000,
    },
    {
      command: 'npx nx serve shell',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env['CI'],
      cwd: workspaceRoot,
      timeout: 180_000,
    },
  ],
  // Chromium only: the scenarios exercise our WebSocket/federation logic,
  // not browser differences. Add firefox/webkit here if that changes.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
