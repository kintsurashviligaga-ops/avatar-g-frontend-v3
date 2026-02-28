import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for running smoke tests against production.
 * Usage: npx playwright test e2e/smoke.spec.ts --config=playwright.prod.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'https://www.myavatar.ge',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // No webServer — tests run against the live production URL
});
