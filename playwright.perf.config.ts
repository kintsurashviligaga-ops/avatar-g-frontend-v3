import { defineConfig, devices } from '@playwright/test';

/**
 * The Phase 3 browser benchmarks (perf/*.pw.ts): run by `npm run perf:browser`, never by `npm run test:e2e` or CI.
 * One worker and no retries, so samples never share the machine with another test and a slow sample is never re-run
 * away. PLAYWRIGHT_BASE_URL points them at a server already running (e.g. `next start` for production-mode numbers,
 * then set PERF_SERVER=next start so the results say so); otherwise they boot `next dev` on the dummy Supabase.
 */
const port = Number(process.env.PLAYWRIGHT_DEV_PORT || 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${port}`;

export default defineConfig({
  testDir: './perf',
  testMatch: /.*\.pw\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'off',
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  ...(process.env.PLAYWRIGHT_BASE_URL ? {} : {
    webServer: {
      command: `next dev -p ${port}`,
      url: baseURL,
      reuseExistingServer: true,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy-anon-key-for-e2e',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-service-role-key-for-e2e',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  }),
});
