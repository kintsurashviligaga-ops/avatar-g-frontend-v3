import { imageCopy, imageErrorCopy } from './copy';

const LOCALES = ['ka', 'en', 'ru'];

test('codes that need a different action than "try again" get their own message in every language', () => {
  const generic = LOCALES.map((l) => imageErrorCopy('provider_failed', l));
  for (const code of ['insufficient_credits', 'queue_full', 'prompt_safety', 'quote_used', 'cancelled', 'not_found']) {
    LOCALES.forEach((l, i) => {
      const text = imageErrorCopy(code, l);
      expect(text).not.toBe(generic[i]);
      expect(text).not.toBe(imageErrorCopy('unsupported_capability', l)); // not_found is not "capability unavailable"
      expect(text.length).toBeGreaterThan(5);
    });
  }
  expect(imageErrorCopy('insufficient_credits', 'ka')).toMatch(/კრედიტ/);
  expect(imageErrorCopy('insufficient_credits', 'ru')).toMatch(/кредит/i);
});

test('the stages a claimed job writes (starting, retrying) are named, not shown as "Queued"', () => {
  LOCALES.forEach((l) => {
    const c = imageCopy(l);
    expect(c.stage('starting')).not.toBe(c.stage('queued'));
    expect(c.stage('retrying')).not.toBe(c.stage('queued'));
  });
});
