// CI-only auto-retry for flaky tests. Mirrors the Playwright e2e `retries: 2` (playwright.config.ts):
// a genuinely-broken test still fails all 3 attempts, but a test that flakes under the loaded 2-core CI
// runner (timing / memory / worker contention) gets a rerun instead of reddening the whole `verify` gate.
// Runs only when CI=true, so local runs stay single-shot and surface real flakes immediately.
if (process.env.CI) {
  // eslint-disable-next-line no-undef
  jest.retryTimes(2, { logErrorsBeforeRetry: true });
}
