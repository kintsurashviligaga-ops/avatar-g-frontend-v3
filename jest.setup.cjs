// CI-only auto-retry for flaky tests. Mirrors the Playwright e2e `retries: 2` (playwright.config.ts):
// a genuinely-broken test still fails all 3 attempts, but a test that flakes under the loaded 2-core CI
// runner (timing / memory / worker contention) gets a rerun instead of reddening the whole `verify` gate.
// Runs only when CI=true, so local runs stay single-shot and surface real flakes immediately.
if (process.env.CI) {
  // eslint-disable-next-line no-undef
  jest.retryTimes(2, { logErrorsBeforeRetry: true });
}

// MEDIA_GOOGLE_ONLY is fail-closed (default ON) since the global E2E provider-boundary fix. Most route suites exercise
// the outside-engine paths that only run with the explicit opt-out, so the opt-out is the test baseline; a suite that
// tests the boundary sets '1' itself, and lib/providers/mediaPolicy.test.ts pins the real default with explicit envs.
if (process.env.MEDIA_GOOGLE_ONLY === undefined) process.env.MEDIA_GOOGLE_ONLY = '0';
// A falsy *_GOOGLE_ONLY counts only with an owner approval on record (lib/env/providerBoundary); the legacy suites run
// as if approved. lib/env/providerBoundary.test.ts and mediaPolicy.test.ts pin the unapproved behaviour explicitly.
if (process.env.OUTSIDE_ENGINES_APPROVED === undefined) process.env.OUTSIDE_ENGINES_APPROVED = 'jest-legacy-suites';
