/** @jest-environment node */
jest.mock('server-only', () => ({}));

import {
  CREDIT_USD,
  FOUNDER_MARGIN_DEFAULT,
  creditsToUsd,
  formatUsd,
  founderMargin,
  retailQuote,
} from './founder';

const env = (v?: string): NodeJS.ProcessEnv => ({ ...(v === undefined ? {} : { FOUNDER_MARGIN: v }) }) as NodeJS.ProcessEnv;

describe('founderMargin — the owner\'s lever', () => {
  test('defaults to 2.5 when unset', () => {
    expect(founderMargin(env())).toBe(FOUNDER_MARGIN_DEFAULT);
    expect(FOUNDER_MARGIN_DEFAULT).toBe(2.5);
  });
  test.each([['2', 2], ['2.5', 2.5], [' 3.25 ', 3.25], ['1', 1], ['10', 10]])('accepts %p', (raw, n) => {
    expect(founderMargin(env(raw))).toBe(n);
  });
  test.each(['', '0', '0.99', '10.01', '-2', 'abc', 'NaN', 'Infinity'])('rejects %p → the default, never 1', (raw) => {
    expect(founderMargin(env(raw))).toBe(FOUNDER_MARGIN_DEFAULT);
  });
});

describe('retailQuote — wholesale → what the user pays', () => {
  test('a credit is ₾0.10 ≈ $0.037', () => {
    expect(CREDIT_USD).toBeCloseTo(0.037037, 5);
  });

  test('base × margin, rounded UP to a whole credit; the USD is those credits\' value', () => {
    // $0.96 (Veo Fast, 8 s) × 2.5 = $2.40 → 64.8 credits → 65 credits → $2.41
    const q = retailQuote(0.96, env());
    expect(q.credits).toBe(65);
    expect(q.usd).toBe(2.41);
    expect(q.usd).toBe(creditsToUsd(q.credits));
  });

  test('the price is never below cost × margin', () => {
    for (const base of [0.003, 0.04, 0.12, 0.96, 3.2, 17.5]) {
      const q = retailQuote(base, env());
      expect(q.credits * CREDIT_USD).toBeGreaterThanOrEqual(base * 2.5 - 1e-9);
      expect(q.credits * CREDIT_USD).toBeLessThan(base * 2.5 + CREDIT_USD + 1e-9);
    }
  });

  test('the margin follows the env, at the next call', () => {
    expect(retailQuote(1, env('2')).credits).toBe(Math.ceil(2 / CREDIT_USD - 1e-9));
    expect(retailQuote(1, env('4')).credits).toBeGreaterThan(retailQuote(1, env('2')).credits);
  });

  test('a tiny paid action costs at least one credit; a zero-cost action stays free', () => {
    expect(retailQuote(0.0001, env()).credits).toBe(1);
    expect(retailQuote(0, env())).toEqual({ usd: 0, credits: 0 });
  });

  test('an exact multiple does not cost a whole extra credit (float noise)', () => {
    const base = (10 * CREDIT_USD) / 2.5; // wholesale that lands exactly on 10 credits
    expect(retailQuote(base, env()).credits).toBe(10);
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('refuses an invalid base cost %p', (bad) => {
    expect(() => retailQuote(bad, env())).toThrow(RangeError);
  });
});

test('formatUsd — two decimals, always', () => {
  expect(formatUsd(2.4)).toBe('$2.40');
  expect(formatUsd(0)).toBe('$0.00');
  expect(formatUsd(12)).toBe('$12.00');
});
