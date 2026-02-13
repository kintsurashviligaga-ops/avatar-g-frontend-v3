import { toCents, fromCents, percentageOf, safeRound } from '@/lib/finance/money';

describe('money helpers', () => {
  test('toCents and fromCents round correctly', () => {
    expect(toCents(1)).toBe(100);
    expect(toCents(1.235)).toBe(124);
    expect(fromCents(124)).toBe(1.24);
  });

  test('percentageOf uses basis points', () => {
    expect(percentageOf(10000, 500)).toBe(500);
    expect(percentageOf(10000, 1800)).toBe(1800);
  });

  test('safeRound rounds to nearest int', () => {
    expect(safeRound(10.4)).toBe(10);
    expect(safeRound(10.5)).toBe(11);
  });
});
