/**
 * Financial simulation engine
 */

import { computeMargin } from './margin';
import { safeRound } from './money';

export interface SimulationInput {
  retail_price_cents: number;
  supplier_cost_cents: number;
  shipping_cost_cents: number;
  vat_enabled: boolean;
  platform_fee_bps: number;
  affiliate_bps?: number;
  refund_reserve_bps?: number;
  expected_orders_per_day: number;
  ad_spend_per_day_cents?: number;
  vat_rate_bps?: number;
}

export interface SimulationOutput {
  net_per_order_cents: number;
  margin_percent: number;
  daily_profit_cents: number;
  monthly_profit_cents: number;
  break_even_orders: number | null;
}

export function simulateScenario(input: SimulationInput): SimulationOutput {
  const expectedOrders = Math.max(0, safeRound(input.expected_orders_per_day));
  const adSpendPerDay = Math.max(0, safeRound(input.ad_spend_per_day_cents || 0));
  const adCostPerOrder = expectedOrders > 0 ? Math.floor(adSpendPerDay / expectedOrders) : 0;

  const marginWithAd = computeMargin({
    retail_price_cents: input.retail_price_cents,
    supplier_cost_cents: input.supplier_cost_cents,
    shipping_cost_cents: input.shipping_cost_cents,
    vat_enabled: input.vat_enabled,
    vat_rate_bps: input.vat_rate_bps,
    platform_fee_bps: input.platform_fee_bps,
    affiliate_bps: input.affiliate_bps,
    refund_reserve_bps: input.refund_reserve_bps,
  });

  const marginNoAd = computeMargin({
    retail_price_cents: input.retail_price_cents,
    supplier_cost_cents: input.supplier_cost_cents,
    shipping_cost_cents: input.shipping_cost_cents,
    vat_enabled: input.vat_enabled,
    vat_rate_bps: input.vat_rate_bps,
    platform_fee_bps: input.platform_fee_bps,
    affiliate_bps: input.affiliate_bps,
    refund_reserve_bps: input.refund_reserve_bps,
  });

  const netPerOrder = marginWithAd.net_profit_cents - adCostPerOrder;
  const dailyProfit = netPerOrder * expectedOrders;
  const monthlyProfit = dailyProfit * 30;

  const breakEvenOrders = marginNoAd.net_profit_cents > 0
    ? Math.ceil(adSpendPerDay / marginNoAd.net_profit_cents)
    : null;

  return {
    net_per_order_cents: netPerOrder,
    margin_percent: marginWithAd.margin_percent,
    daily_profit_cents: dailyProfit,
    monthly_profit_cents: monthlyProfit,
    break_even_orders: breakEvenOrders,
  };
}
