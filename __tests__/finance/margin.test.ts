import { computeMargin, assertPositiveMargin } from '@/lib/finance/margin';

describe('margin calculation', () => {
  test('computeMargin with VAT enabled calculates fees on net of VAT', () => {
    const result = computeMargin({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: true,
      vat_rate_bps: 1800,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
    });

    expect(result.vat_amount_cents).toBe(1525);
    expect(result.platform_fee_cents).toBeGreaterThan(0);
    expect(result.net_profit_cents).toBeGreaterThan(0);
    expect(result.margin_percent).toBeGreaterThan(0);
  });

  test('computeMargin with VAT disabled', () => {
    const result = computeMargin({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: false,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
    });

    expect(result.vat_amount_cents).toBe(0);
    expect(result.platform_fee_cents).toBeGreaterThan(0);
    expect(result.net_profit_cents).toBeGreaterThan(0);
  });

  test('computeMargin zero affiliate fee', () => {
    const result = computeMargin({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: true,
      vat_rate_bps: 1800,
      platform_fee_bps: 500,
      affiliate_bps: 0,
      refund_reserve_bps: 200,
    });

    expect(result.affiliate_fee_cents).toBe(0);
  });

  test('assertPositiveMargin throws on negative profit', () => {
    const result = computeMargin({
      retail_price_cents: 1000,
      supplier_cost_cents: 8000,
      shipping_cost_cents: 1000,
      vat_enabled: false,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
    });

    expect(() => assertPositiveMargin(result)).toThrow('Negative margin');
  });

  test('assertPositiveMargin succeeds on positive profit', () => {
    const result = computeMargin({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: true,
      vat_rate_bps: 1800,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
    });

    expect(() => assertPositiveMargin(result)).not.toThrow();
  });
});
