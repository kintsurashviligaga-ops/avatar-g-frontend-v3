import { defineConfig, devices } from '@playwright/test';

/**
 * Music Studio v1.0 — the REAL-BACKEND browser E2E (tests/music-studio-live/*), for the isolated GitHub Actions job only
 * (.github/workflows/music-studio-e2e-local.yml): `next start` of this branch against a throwaway local Supabase stack,
 * on the Video Core harness (its fail-closed global setup, synthetic users and sign-in through the real sheet:
 * tests/video-core-live/{global-setup,auth.setup,_live}.ts).
 *
 * The music provider is the isolated stand-in (lib/music/studio/e2eProvider): a synthetic ffmpeg tone, never Google
 * Lyria. Quote, ledger, worker, QC, Storage, Library rows, edits and refunds are real.
 *
 * Projects run one at a time (one worker: one shared server, one rate limiter). Desktop Chrome and an iPhone-13
 * viewport, each signed in as its own synthetic user, run the journey and the voice tool-dispatch specs; the API project
 * runs access, ownership, Storage/RLS and billing checks as the ordinary `payer` and `other` users.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const STATE_DIR = 'test-results/video-core-live/state';
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {};
// As in playwright.video-core-live.config.ts: the page CSP names the hosted Supabase, and the local stack's https uses a
// CA made for this run only; both are bypassed here and only here.
const common = { bypassCSP: true, ignoreHTTPSErrors: true, ...executable };
const phone = { ...devices['iPhone 13'], browserName: 'chromium' as const };

export default defineConfig({
  testDir: './tests',
  testMatch: /(music-studio-live\/.*\.spec|video-core-live\/auth\.setup)\.ts$/,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/music-studio-live/results.json' }],
    ['html', { outputFolder: 'test-results/music-studio-live/html', open: 'never' }],
  ],
  outputDir: 'test-results/music-studio-live/artifacts',
  globalSetup: './tests/video-core-live/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    { name: 'setup-desktop', testMatch: /video-core-live\/auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'], ...common } },
    { name: 'setup-mobile', testMatch: /video-core-live\/auth\.setup\.ts$/, use: { ...phone, ...common } },
    { name: 'api', testMatch: /music-studio-live\/api\.spec\.ts$/, use: { ...common } },
    {
      name: 'desktop', testMatch: /music-studio-live\/(journey|voice)\.spec\.ts$/, dependencies: ['setup-desktop'],
      use: { ...devices['Desktop Chrome'], ...common, storageState: `${STATE_DIR}/desktop.json` },
    },
    {
      name: 'mobile', testMatch: /music-studio-live\/(journey|voice)\.spec\.ts$/, dependencies: ['setup-mobile'],
      use: { ...phone, ...common, storageState: `${STATE_DIR}/mobile.json` },
    },
  ],
});
