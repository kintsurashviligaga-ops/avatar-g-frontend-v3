/** @jest-environment node */
/**
 * secretMatches — the shared-secret check every webhook / internal route uses. An UNSET secret never matches: the
 * Agent G, Telegram and WhatsApp checks used to be skipped entirely when their env var was missing.
 */
import { secretMatches } from './secretMatch';

test('an unset or blank configured secret matches nothing — not even an empty or blank presentation', () => {
  for (const expected of [undefined, null, '', '   ']) {
    for (const provided of [undefined, null, '', '   ', 'anything']) {
      expect(secretMatches(provided, expected)).toBe(false);
    }
  }
});

test('the exact secret matches (surrounding whitespace from a header or env paste is ignored)', () => {
  expect(secretMatches('s3cret-value', 's3cret-value')).toBe(true);
  expect(secretMatches(' s3cret-value ', 's3cret-value\n')).toBe(true);
});

test('anything else does not — a prefix, a longer value, a different case', () => {
  expect(secretMatches('s3cret', 's3cret-value')).toBe(false);
  expect(secretMatches('s3cret-value-and-more', 's3cret-value')).toBe(false);
  expect(secretMatches('S3CRET-VALUE', 's3cret-value')).toBe(false);
});
