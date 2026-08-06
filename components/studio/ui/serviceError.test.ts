/** @jest-environment node */
/**
 * A service failure must never show the user a machine code or English provider prose.
 *
 * ⚠️ `setError(j.error || t.failed)` WAS THE PATTERN. LipsyncStudio had been hardened against exactly
 * this on its START path and then printed the raw string anyway on its POLL path twenty lines below;
 * MusicStudio never had the guard at all. So a Georgian panel could display `duplicate_request`, or a
 * sentence written for an American developer, as if it were user-facing copy.
 */
import { describeServiceError } from './serviceError';

const KA_FALLBACK = 'ვერ მოხერხდა';

describe('describeServiceError', () => {
  it('translates the codes users actually hit', () => {
    expect(describeServiceError('insufficient_credits', 'ka', KA_FALLBACK)).toContain('კრედიტი');
    expect(describeServiceError('duplicate_request', 'ka', KA_FALLBACK)).toContain('უკვე');
    expect(describeServiceError('provider_not_configured', 'ka', KA_FALLBACK)).toContain('გამორთულია');
  });

  it('finds a known failure inside a longer provider sentence', () => {
    // Providers rarely return a bare code — it arrives wrapped in prose.
    expect(describeServiceError('Error: you do not have enough credits to run this', 'en', 'x'))
      .toContain('Top up');
    expect(describeServiceError('429 Too Many Requests', 'en', 'x')).toContain('Wait a minute');
  });

  it('NEVER echoes an unrecognised string back at the user', () => {
    // The whole point. An unmapped string is a stack fragment or internal wording — showing it looks
    // like transparency and reads as a crash.
    const raw = 'TypeError: Cannot read properties of undefined (reading \'clip\')';
    expect(describeServiceError(raw, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
  });

  it('falls back on empty, null and non-string input', () => {
    expect(describeServiceError('', 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
    expect(describeServiceError(null, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
    expect(describeServiceError({ code: 5 }, 'ka', KA_FALLBACK)).toBe(KA_FALLBACK);
  });

  it('reads Georgian for any locale it does not ship', () => {
    expect(describeServiceError('rate_limited', 'de', 'x')).toBe(describeServiceError('rate_limited', 'ka', 'x'));
  });

  it('says what to do next, not just what broke', () => {
    // "Something went wrong" leaves the user nowhere to go.
    for (const code of ['insufficient_credits', 'timeout', 'too_large', 'unsupported_format']) {
      expect(describeServiceError(code, 'en', 'x')).toMatch(/try|top up|wait|sign in/i);
    }
  });
});
