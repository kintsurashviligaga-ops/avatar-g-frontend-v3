import { defineConfig, devices } from '@playwright/test';

/**
 * Video Core v1.0 — the REAL-BACKEND browser E2E (tests/video-core-live/*), for the isolated GitHub Actions job
 * (.github/workflows/video-core-e2e-local.yml) only: `next start` of this branch against a throwaway local Supabase
 * stack (auth, storage, PostgREST, Postgres with the Test Schema Baseline from e2e/video-core-live/baseline), real
 * uploads, real ffmpeg renders, real ledger. Nothing is mocked except what is said in each spec, and no paid provider
 * is ever called (no provider credential exists in the job).
 *
 * The global setup refuses to run (tests/video-core-live/guard.ts) unless every database-pointing variable names this
 * machine. Projects run one at a time (one worker): one shared server and one rate limiter. Two browser projects — a desktop and an iPhone-13 viewport — each signed in through the real sign-in sheet
 * by its own setup project, as its own synthetic user; one API project for RLS, RPC and access checks and the film
 * stitch's charges (billing.spec).
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const STATE_DIR = 'test-results/video-core-live/state';
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {};
// The page's CSP names the hosted Supabase (https://*.supabase.co, lib/security/csp.js); the local stack is another
// origin, so the browser would block sign-in, the storage PUT and the master's playback. The CSP itself is covered by
// its own unit tests; here it is bypassed, and only here. The stack is served over https with a certificate from a CA
// the workflow made for this run only (Node trusts it through NODE_EXTRA_CA_CERTS); the browser is told to accept it,
// and only in this config: its host is a reserved `.test` name that resolves to this runner's own loopback.
const common = { bypassCSP: true, ignoreHTTPSErrors: true, ...executable };
const phone = { ...devices['iPhone 13'], browserName: 'chromium' as const };

export default defineConfig({
  testDir: './tests/video-core-live',
  testMatch: /.*\.(spec|setup)\.ts$/,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  retries: 0,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/video-core-live/results.json' }],
    ['html', { outputFolder: 'test-results/video-core-live/html', open: 'never' }],
  ],
  outputDir: 'test-results/video-core-live/artifacts',
  globalSetup: './tests/video-core-live/global-setup.ts',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [
    { name: 'setup-desktop', testMatch: /auth\.setup\.ts$/, use: { ...devices['Desktop Chrome'], ...common } },
    { name: 'setup-mobile', testMatch: /auth\.setup\.ts$/, use: { ...phone, ...common } },
    { name: 'api', testMatch: /(contracts|billing)\.spec\.ts$/, use: { ...common } },
    {
      name: 'desktop', testMatch: /journey\.spec\.ts$/, dependencies: ['setup-desktop'],
      use: { ...devices['Desktop Chrome'], ...common, storageState: `${STATE_DIR}/desktop.json` },
    },
    {
      name: 'mobile', testMatch: /journey\.spec\.ts$/, dependencies: ['setup-mobile'],
      use: { ...phone, ...common, storageState: `${STATE_DIR}/mobile.json` },
    },
  ],
});
