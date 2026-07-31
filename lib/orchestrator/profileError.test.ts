/** @jest-environment node */
import { isMissingProfileError } from './profileError';

/**
 * The RPC collapses "no profile row" and "balance too low" into the SAME message
 * (`insufficient_credits`) and only tells them apart in `details`. Getting this predicate wrong is
 * expensive in both directions, so both directions are tested.
 */
describe('missing-profile detection', () => {
  it('recognises the real live payload — the one that stranded 2 of 17 users', () => {
    // Verbatim from a probe against the production database.
    expect(isMissingProfileError('no profile record', 'insufficient_credits')).toBe(true);
  });

  it('recognises the alternate wording', () => {
    expect(isMissingProfileError('profile not found', 'insufficient_credits')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isMissingProfileError('No Profile Record', 'INSUFFICIENT_CREDITS')).toBe(true);
  });

  it('reads either field, since callers do not always get both', () => {
    expect(isMissingProfileError(null, 'no profile record')).toBe(true);
    expect(isMissingProfileError('no profile record', null)).toBe(true);
  });

  describe('must NOT fire on a genuinely empty balance — that would hand out free renders', () => {
    it('the real live payload for an empty wallet', () => {
      // Also verbatim: this is what the same user returns once the row exists.
      expect(isMissingProfileError('have 0 need 1', 'insufficient_credits')).toBe(false);
    });

    it('other genuine shortfalls', () => {
      expect(isMissingProfileError('have 3 need 15', 'insufficient_credits')).toBe(false);
      expect(isMissingProfileError(null, 'insufficient_credits')).toBe(false);
    });
  });

  it('is total on absent input', () => {
    expect(isMissingProfileError(undefined, undefined)).toBe(false);
    expect(isMissingProfileError('', '')).toBe(false);
  });
});
