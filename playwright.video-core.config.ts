import { defineConfig, devices } from '@playwright/test';

/**
 * Video Core v1.0 — round-3 real-browser verification (tests/video-core/*). Runs against an ALREADY RUNNING
 * `next dev -p 3000` (no webServer block: this config never boots or kills a server), on two projects: a desktop
 * Chrome viewport and an iPhone 13 viewport, because every Video Core screen is contracted for both.
 *
 * Every server route in these specs is mocked with page.route — nothing is uploaded, rendered or charged.
 * Results land in docs/handoffs/video-core/evidence/t2-round3-final/playwright-results.json (plus the list reporter).
 */
const port = Number(process.env.PLAYWRIGHT_DEV_PORT || 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/video-core',
  timeout: 90_000,
  retries: 0,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['json', { outputFile: 'docs/handoffs/video-core/evidence/t2-round3-final/playwright-results.json' }],
  ],
  outputDir: 'test-results/video-core',
  globalSetup: './tests/video-core/_global-setup.ts',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
    // A sandbox that ships its own Chromium names it here; CI leaves it unset.
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {}),
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium' } }, // the device descriptor defaults to WebKit; only Chromium is installed here
  ],
});
