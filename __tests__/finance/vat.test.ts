import { computeVatInclusive } from '@/lib/finance/vat';

describe('vat helpers', () => {
  test('computeVatInclusive for 18% uses floor', () => {
    const result = computeVatInclusive(10000, 1800);
    expect(result.vat_amount_cents).toBe(1525);
    expect(result.net_amount_cents).toBe(8475);
  });

  test('computeVatInclusive handles zero rate', () => {
    const result = computeVatInclusive(10000, 0);
    expect(result.vat_amount_cents).toBe(0);
    expect(result.net_amount_cents).toBe(10000);
  });
});
