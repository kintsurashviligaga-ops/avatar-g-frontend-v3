/**
 * Decision Engine - Product profitability evaluation and pricing recommendations
 * Server-side only
 */

import { computeMargin } from '@/lib/finance/margin';
import { computeVatInclusive, GEORGIA_VAT_BPS } from '@/lib/finance/vat';
import { percentageOf, safeRound } from '@/lib/finance/money';
import type { ProductCandidate, DecisionResult, Decision, MarginThresholds, ProductType } from './types';

const DEFAULT_THRESHOLDS: MarginThresholds = {
  standard: 1500, // 15%
  dropshipping: 2500, // 25%
  digital: 7000, // 70%
};

/**
 * Evaluate product candidate for publishability
 * Returns decision + reasons + recommended price if margin too low
 */
export function evaluateProductCandidate(
  input: ProductCandidate,
  thresholds: Partial<MarginThresholds> = {}
): DecisionResult {
  const marginThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const reasons: string[] = [];
  const warnings: string[] = [];

  // Compute margin using finance lib
  const marginResult = computeMargin({
    retail_price_cents: input.retailPriceCents,
    supplier_cost_cents: input.supplierCostCents,
    shipping_cost_cents: input.shippingCostCents,
    vat_enabled: input.vatEnabled,
    vat_rate_bps: input.vatRateBps || GEORGIA_VAT_BPS,
    platform_fee_bps: input.platformFeeBps || 500,
    affiliate_bps: input.affiliateBps || 0,
    refund_reserve_bps: input.refundReserveBps || 200,
  });

  // Rule 1: Reject if net <= 0
  if (marginResult.net_profit_cents <= 0) {
    reasons.push('Net profit per order is zero or negative');
  }

  // Compute margin in basis points for comparison
  const marginBps = input.retailPriceCents > 0
    ? safeRound((marginResult.net_profit_cents / input.retailPriceCents) * 10000)
    : 0;

  // Rule 2: Check against threshold per product type
  const threshold = marginThresholds[input.productType];
  if (marginBps < threshold) {
    reasons.push(
      `Margin ${(marginBps / 100).toFixed(2)}% below ${input.productType} minimum ${(threshold / 100).toFixed(2)}%`
    );
  }

  // Warnings: Shipping time
  if (input.shippingDaysMax && input.shippingDaysMax > 21) {
    warnings.push(
      `Shipping takes ${input.shippingDaysMax} days (typical buyers expect <= 21 days)`
    );
  }

  // Warnings: Low refund reserve
  if ((input.refundReserveBps || 200) < 200) {
    warnings.push('Refund reserve below 200 bps (2%) - insufficient safety margin');
  }

  // Decide
  const decision: Decision = reasons.length > 0 ? 'reject' : 'publish';

  // Compute recommended price if rejected due to margin
  const marginReasonExists = reasons.some((r) => r.includes('Margin'));
  let recommendedPriceCents: number | undefined;
  if (marginReasonExists && decision === 'reject') {
    recommendedPriceCents = computeRecommendedPrice(
      input,
      threshold,
      marginThresholds
    );
  }

  return {
    decision,
    reasons,
    warnings,
    computed: {
      netPerOrderCents: marginResult.net_profit_cents,
      marginBps,
      marginPercent: marginResult.margin_percent,
      vatAmountCents: marginResult.vat_amount_cents,
      totalCostsCents:
        input.supplierCostCents +
        input.shippingCostCents +
        marginResult.platform_fee_cents +
        marginResult.affiliate_fee_cents +
        marginResult.refund_reserve_cents,
    },
    recommendedPriceCents,
  };
}

/**
 * Compute recommended retail price to achieve target margin
 * Working backwards from: netProfit = price - vat - costs - fees
 * And: marginBps = netProfit / price * 10000
 * So: price = netProfit / (marginBps / 10000)
 */
function computeRecommendedPrice(
  input: ProductCandidate,
  targetMarginBps: number,
  thresholds: MarginThresholds
): number {
  // Estimate total non-VAT costs
  const totalCosts =
    input.supplierCostCents +
    input.shippingCostCents +
    percentageOf(input.retailPriceCents, input.platformFeeBps || 500) +
    percentageOf(input.retailPriceCents, input.affiliateBps || 0) +
    percentageOf(input.retailPriceCents, input.refundReserveBps || 200);

  // Estimate VAT if enabled
  const estimatedVat = input.vatEnabled
    ? computeVatInclusive(input.retailPriceCents, input.vatRateBps || GEORGIA_VAT_BPS)
        .vat_amount_cents
    : 0;

  // Target net per order: price * (targetMarginBps / 10000)
  // Rearranged: price = (costs + vat + netProfit) where netProfit = price * (targetMarginBps / 10000)
  // This becomes: price * (1 - targetMarginBps/10000) = costs + vat
  // So: price = (costs + vat) / (1 - targetMarginBps / 10000)

  const marginRatio = 1 - targetMarginBps / 10000;
  if (marginRatio <= 0) {
    // Target margin is 100% or higher, which is impossible
    return input.retailPriceCents * 1.5; // Fallback: 50% increase
  }

  const recommendedPrice = safeRound((totalCosts + estimatedVat) / marginRatio);
  return Math.max(recommendedPrice, input.retailPriceCents);
}
