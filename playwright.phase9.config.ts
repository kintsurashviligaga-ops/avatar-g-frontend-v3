import { defineConfig, devices } from '@playwright/test';

/**
 * v5.1 Phase 9: mocked UI tests for the Live Agent Workspace preview (e2e-phase9/). Its own config because the preview
 * route answers only with AGENT_WORKSPACE_PREVIEW=on, which the main suite must never turn on. MOCKED: the page replays
 * lib/agent/liveWorkspace/mock on a timer; no API, no database, no money.
 */
const port = Number(process.env.PLAYWRIGHT_PHASE9_PORT || 3109);

export default defineConfig({
  testDir: './e2e-phase9',
  timeout: 90_000, // a cold `next dev` compile of the route on a slow runner
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-phase9' }]] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: { AGENT_WORKSPACE_PREVIEW: 'on', SUPABASE_UNAVAILABLE_PAGE: 'off' },
  },
});
