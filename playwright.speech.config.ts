import { defineConfig, devices } from '@playwright/test';

/**
 * Read-aloud in a real browser (MASTER TASK v3.1 §5, Phase 4 PR 8): tests/speech-readaloud.spec.ts against `next dev`,
 * with /api/chat/gemini, /api/tts/gemini, Supabase and Gemini Live all mocked. No provider is called and nothing is
 * spent. CI runs it in Chromium, Firefox and WebKit (.github/workflows/speech-acceptance.yml); pick one with --project.
 * The audio is code-generated (tests/fixtures/speechAudio): these runs prove order, requests and who has the speakers,
 * never how a voice sounds, and their timings are app overhead with an instant fake provider, not provider latency.
 */
const port = Number(process.env.PLAYWRIGHT_DEV_PORT || 3221);
const chromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

export default defineConfig({
  testDir: './tests',
  testMatch: ['speech-readaloud.spec.ts'],
  timeout: 120_000,
  globalTimeout: 1_200_000,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/speech/results.json' }]],
  use: { baseURL: `http://localhost:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure', viewport: { width: 1280, height: 800 } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, ...(chromium ? { launchOptions: { executablePath: chromium } } : {}) } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `node node_modules/next/dist/bin/next dev -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'speech-local-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'speech-local-service',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
});
