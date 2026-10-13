import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_DEV_PORT || 3147);
const evidence = process.env.IMAGE_STUDIO_EVIDENCE_DIR || './docs/handoffs/image-studio/evidence';
export default defineConfig({
  testDir: './tests', testMatch: 'image-studio.spec.ts', timeout: 90000, workers: 1, retries: 0,
  outputDir: evidence + '/browser-results',
  reporter: [['list'], ['json', { outputFile: evidence + '/browser-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:' + port, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'node node_modules/next/dist/bin/next dev -p ' + port, url: 'http://127.0.0.1:' + port,
    reuseExistingServer: false, timeout: 120000 },
});
