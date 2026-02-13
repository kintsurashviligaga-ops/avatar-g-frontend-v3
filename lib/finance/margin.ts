/**
 * Margin math - server-side only
 */

import { percentageOf, safeRound } from './money';
import { computeVatInclusive, GEORGIA_VAT_BPS } from './vat';

export interface MarginInput {
  retail_price_cents: number;
  supplier_cost_cents: number;
  shipping_cost_cents: number;
  vat_enabled: boolean;
  vat_rate_bps?: number;
  platform_fee_bps: number;
  affiliate_bps?: number;
  refund_reserve_bps?: number;
}

export interface MarginResult {
  vat_amount_cents: number;
  platform_fee_cents: number;
  affiliate_fee_cents: number;
  refund_reserve_cents: number;
  net_profit_cents: number;
  margin_percent: number;
}

export function computeMargin(input: MarginInput): MarginResult {
  const retailPrice = Math.max(0, safeRound(input.retail_price_cents));
  const supplierCost = Math.max(0, safeRound(input.supplier_cost_cents));
  const shippingCost = Math.max(0, safeRound(input.shipping_cost_cents));

  const vatRate = input.vat_rate_bps ?? GEORGIA_VAT_BPS;
  const vat = input.vat_enabled ? computeVatInclusive(retailPrice, vatRate).vat_amount_cents : 0;

  const platformFee = percentageOf(retailPrice - vat, input.platform_fee_bps);
  const affiliateFee = percentageOf(retailPrice - vat, input.affiliate_bps || 0);
  const refundReserve = percentageOf(retailPrice - vat, input.refund_reserve_bps || 200);

  const netProfit =
    retailPrice -
    vat -
    supplierCost -
    shippingCost -
    platformFee -
    affiliateFee -
    refundReserve;

  const marginPercent = retailPrice > 0 ? (netProfit / retailPrice) * 100 : 0;

  return {
    vat_amount_cents: vat,
    platform_fee_cents: platformFee,
    affiliate_fee_cents: affiliateFee,
    refund_reserve_cents: refundReserve,
    net_profit_cents: netProfit,
    margin_percent: Math.round(marginPercent * 100) / 100,
  };
}

export function assertPositiveMargin(result: MarginResult): void {
  if (result.net_profit_cents <= 0) {
    throw new Error('Negative margin: product is unprofitable');
  }
}
