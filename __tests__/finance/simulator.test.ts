import { simulateScenario } from '@/lib/finance/simulator';

describe('finance simulator', () => {
  test('simulateScenario returns basic projections', () => {
    const output = simulateScenario({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: true,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
      expected_orders_per_day: 10,
      ad_spend_per_day_cents: 1000,
    });

    expect(output.net_per_order_cents).toBeDefined();
    expect(output.margin_percent).toBeGreaterThan(0);
    expect(output.daily_profit_cents).toBeDefined();
    expect(output.monthly_profit_cents).toBeDefined();
  });

  test('simulateScenario calculates break-even orders', () => {
    const output = simulateScenario({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: true,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
      expected_orders_per_day: 10,
      ad_spend_per_day_cents: 5000,
    });

    expect(output.break_even_orders).toBeGreaterThan(0);
  });

  test('simulateScenario returns null break-even on negative margin', () => {
    const output = simulateScenario({
      retail_price_cents: 1000,
      supplier_cost_cents: 8000,
      shipping_cost_cents: 1000,
      vat_enabled: false,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
      expected_orders_per_day: 10,
      ad_spend_per_day_cents: 1000,
    });

    expect(output.break_even_orders).toBeNull();
  });

  test('simulateScenario daily profit calculation', () => {
    const output = simulateScenario({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: true,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
      expected_orders_per_day: 5,
      ad_spend_per_day_cents: 0,
    });

    expect(output.daily_profit_cents).toBe(output.net_per_order_cents * 5);
    expect(output.monthly_profit_cents).toBe(output.daily_profit_cents * 30);
  });

  test('simulateScenario with zero ad spend', () => {
    const output = simulateScenario({
      retail_price_cents: 10000,
      supplier_cost_cents: 2000,
      shipping_cost_cents: 500,
      vat_enabled: true,
      platform_fee_bps: 500,
      affiliate_bps: 1000,
      refund_reserve_bps: 200,
      expected_orders_per_day: 10,
    });

    expect(output.break_even_orders).toBeGreaterThan(0);
  });
});
