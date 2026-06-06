import { defineConfig, devices } from '@playwright/test';

/**
 * Live production smoke config — runs against the DEPLOYED site with NO local dev
 * server (unlike playwright.config.ts, which boots `next dev`). This is the safe,
 * zero-cost half of the "real E2E": it verifies the production app actually
 * RENDERS its core surfaces for a guest — no generation, no spend, no flake on
 * providers. PLAYWRIGHT_BASE_URL overrides the target (e.g. a Vercel preview URL).
 *
 *   PLAYWRIGHT_BASE_URL=https://myavatar.ge npx playwright test --config=playwright.smoke.config.ts
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'https://myavatar.ge';

export default defineConfig({
  testDir: './tests',
  testMatch: /smoke-live\.spec\.ts/,
  fullyParallel: true,
  retries: 1,
  reporter: [['list']],
  use: { baseURL, trace: 'off' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
