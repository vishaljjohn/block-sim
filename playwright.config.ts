import { defineConfig, devices } from '@playwright/test';

/** BASE_URL=https://<user>.github.io/block-sim/ npx playwright test   → run against the live site. */
const live = process.env.BASE_URL;
const base = live ?? 'http://localhost:4173/block-sim/';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: live ? 1 : 0,
  reporter: [['list']],
  use: { baseURL: base, trace: 'retain-on-failure', viewport: { width: 1366, height: 820 } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 820 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1366, height: 820 } } },
    { name: 'ipad', use: { ...devices['iPad Pro 11 landscape'] } },
  ],
  webServer: live
    ? undefined
    : {
        command: 'npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173/block-sim/',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
