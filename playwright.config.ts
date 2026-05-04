import { defineConfig, devices } from '@playwright/test';

const playwrightDevPort = Number(process.env.PLAYWRIGHT_DEV_PORT || 3000);
const playwrightBaseUrl = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${playwrightDevPort}`;
const shouldCleanNextCache = process.env.PLAYWRIGHT_CLEAN_NEXT === '1';
const forceFreshWebServer = process.env.PLAYWRIGHT_FORCE_FRESH_SERVER === '1';

const webServerCommand = `${shouldCleanNextCache ? 'rm -rf .next && ' : ''}next dev -p ${playwrightDevPort}`;

export default defineConfig({
  testDir: './tests',
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
  },
});
