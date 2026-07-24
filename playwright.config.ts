import { defineConfig, devices } from '@playwright/test';

const playwrightDevPort = Number(process.env.PLAYWRIGHT_DEV_PORT || 3000);
const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${playwrightDevPort}`;
const shouldCleanNextCache = process.env.PLAYWRIGHT_CLEAN_NEXT === '1';
const forceFreshWebServer = process.env.PLAYWRIGHT_FORCE_FRESH_SERVER === '1';

const webServerCommand = `${shouldCleanNextCache ? 'rm -rf .next && ' : ''}next dev -p ${playwrightDevPort}`;

export default defineConfig({
  testDir: './tests',
  // The live production smoke (smoke-live.spec.ts) runs ONLY via
  // playwright.smoke.config.ts against the deployed site — never against the local
  // `next dev` server this config boots.
  testIgnore: /smoke-live\.spec\.ts/,
  // Per-test budget generous enough to absorb a cold `next dev` first-compile of a route on a slow CI
  // runner (default 30s was shorter than the cold compile → the preview-e2e first navigation flaked).
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: playwrightBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: webServerCommand,
    url: `http://localhost:${playwrightDevPort}`,
    reuseExistingServer: forceFreshWebServer ? false : !process.env.CI,
    timeout: 120_000, // give `next dev` a generous cold-boot window before the first navigation
  },
});
