/**
 * Auto-Margin Guard
 * Simulates worst-case margin scenarios before product publication
 * Ensures product doesn't become unprofitable under adverse conditions
 */

import { MarginSimulation, MarginScenario } from './types';
import { computeMargin } from '@/lib/finance/margin';
import { roundToNearest } from '@/lib/finance/money';
import { GEORGIA_VAT_BPS } from '@/lib/finance/vat';

interface WorstCaseFactors {
  maxRefundRatePct: number; // 0-100 (worst case)
  maxShippingDelayDays: number; // Additional days delay
  maxReturnShippingCostCents: number; // Return shipping cost
  maxPlatformFeeincreaseBps: number; // Additional fee increase
  competitorPriceCutPct: number; // Competitive price pressure
}

/**
 * Simulate worst-case margin: multiple negative factors hitting at once
 *
 * Worst-case scenarios:
 * 1. Best case: Normal operation (most likely)
 * 2. Average case: Some refunds, minor delays
 * 3. Worst case: High refunds, long delays, competitor price war, platform fee increase
 */
export function simulateWorstCaseMargin(
  retailPriceCents: number,
  supplierCostCents: number,
  shippingCostCents: number,
  platformFeeBps: number,
  affiliateFeeBps: number,
  refundReserveBps: number,
  worseCaseFactors: WorstCaseFactors
): MarginSimulation {
  // Best case: everything goes well
  const bestCaseResult = computeMargin({
    retail_price_cents: retailPriceCents,
    supplier_cost_cents: supplierCostCents,
    shipping_cost_cents: shippingCostCents,
    vat_enabled: true,
    vat_rate_bps: GEORGIA_VAT_BPS,
    platform_fee_bps: platformFeeBps,
    affiliate_bps: affiliateFeeBps,
    refund_reserve_bps: refundReserveBps,
  });

  // Worst case: multiple bad things happen
  // 1. Refund rate high: Lose revenue on some orders
  const refundLoss = Math.round(
    (retailPriceCents * worseCaseFactors.maxRefundRatePct) /100
  );

  // 2. Shipping delays increase refund requests
  const _delayMargin = Math.max(0, -worseCaseFactors.maxShippingDelayDays * 100); // 100 bps per day

  // 3. Return shipping cost eats into margin
  // 4. Platform fee increases
  const additionalFeesBps = worseCaseFactors.maxPlatformFeeincreaseBps;

  // 5. Competitor price pressure: We match lower price
  const competitorAdjustedPrice = Math.round(
    retailPriceCents * (1 - worseCaseFactors.competitorPriceCutPct / 100)
  );

  // Worst-case effective price after refunds and competitor pressure
  const worstCaseEffectivePrice = Math.max(competitorAdjustedPrice, retailPriceCents - refundLoss);

  // Recompute margin with worst-case inputs
  const additionalCosts =
    worseCaseFactors.maxReturnShippingCostCents + worseCaseFactors.maxRefundRatePct * 10; // Rough estimate

  const worstCaseResult = computeMargin({
    retail_price_cents: worstCaseEffectivePrice,
    supplier_cost_cents: supplierCostCents + additionalCosts,
    shipping_cost_cents: shippingCostCents + worseCaseFactors.maxReturnShippingCostCents / 2, // Some customers don't return
    vat_enabled: true,
    vat_rate_bps: GEORGIA_VAT_BPS,
    platform_fee_bps: platformFeeBps + additionalFeesBps,
    affiliate_bps: affiliateFeeBps + 500, // Affiliate fees increase in promotional periods
    refund_reserve_bps: refundReserveBps + 500, // Need more buffer
  });

  // Average case: mild adverse conditions
  const avgCaseResult = computeMargin({
    retail_price_cents: retailPriceCents - Math.round(retailPriceCents * (worseCaseFactors.competitorPriceCutPct / 100) * 0.3),
    supplier_cost_cents: supplierCostCents + worseCaseFactors.maxReturnShippingCostCents / 4,
    shipping_cost_cents: shippingCostCents,
    vat_enabled: true,
    vat_rate_bps: GEORGIA_VAT_BPS,
    platform_fee_bps: platformFeeBps + additionalFeesBps * 0.5,
    affiliate_bps: affiliateFeeBps,
    refund_reserve_bps: refundReserveBps,
  });

  // Build scenario breakdown
  const scenarios: MarginScenario[] = [
    {
      name: 'Best Case (Normal)',
      probability: 0.60, // 60% of time
      marginBps: Math.round(bestCaseResult.margin_percent * 100),
      assumptions: {
        refundRate: '2-3%',
        deliveryDelay: 'On-time',
        priceCompetition: 'None',
        platformFees: 'Standard',
      },
    },
    {
      name: 'Average Case (Minor Issues)',
      probability: 0.30, // 30% of time
      marginBps: Math.round(avgCaseResult.margin_percent * 100),
      assumptions: {
        refundRate: `${Math.round(worseCaseFactors.maxRefundRatePct / 2)}%`,
        deliveryDelay: `${Math.round(worseCaseFactors.maxShippingDelayDays * 0.5)} days`,
        priceCompetition: `${Math.round(worseCaseFactors.competitorPriceCutPct * 0.3)}%`,
        platformFees: '+50 bps',
      },
    },
    {
      name: 'Worst Case (All Negatives)',
      probability: 0.10, // 10% of time (rare but possible)
      marginBps: Math.round(worstCaseResult.margin_percent * 100),
      assumptions: {
        refundRate: `${worseCaseFactors.maxRefundRatePct}%`,
        deliveryDelay: `${worseCaseFactors.maxShippingDelayDays} days`,
        priceCompetition: `${worseCaseFactors.competitorPriceCutPct}%`,
        platformFees: `${Math.round(additionalFeesBps / 100)}%`,
        returnShipping: `₾${Math.round(worseCaseFactors.maxReturnShippingCostCents / 100)}`,
      },
    },
  ];

  // Determine approval: Worst case must be profitable
  const minAcceptableMarginBps = 500; // 5% absolute minimum
  const worstCaseMarginBps = Math.round(worstCaseResult.margin_percent * 100);
  const isApproved = worstCaseMarginBps >= minAcceptableMarginBps;

  const rejectionReason = !isApproved
    ? `Worst-case margin ${(worstCaseMarginBps / 100).toFixed(1)}% falls below 5% minimum. Recommended: increase price by ${Math.ceil(
        ((minAcceptableMarginBps - worstCaseMarginBps) / retailPriceCents) * 10000
      )} bps`
    : undefined;

  return {
    bestCaseMarginBps: Math.round(bestCaseResult.margin_percent * 100),
    worstCaseMarginBps: worstCaseMarginBps,
    avgCaseMarginBps: Math.round(avgCaseResult.margin_percent * 100),
    scenarios,
    isApproved,
    rejectionReason,
  };
}

/**
 * Conservative margin check: Product must survive worst case
 * Returns the minimum price needed to stay profitable in worst case
 */
export function minPriceForWorstCase(
  supplierCostCents: number,
  shippingCostCents: number,
  platformFeeBps: number,
  affiliateFeeBps: number,
  refundReserveBps: number,
  worseCaseFactors: WorstCaseFactors,
  minMarginBps = 500 // 5% minimum
): number {
  // Work backwards: What price is needed to maintain minMarginBps in worst case?
  // Margin = (Price - Costs - Fees) / Price
  // So: Price = Costs / (1 - margin/10000)

  const totalCostsInWorstCase = supplierCostCents +
    shippingCostCents +
    worseCaseFactors.maxReturnShippingCostCents +
    Math.round((supplierCostCents * (platformFeeBps + worseCaseFactors.maxPlatformFeeincreaseBps)) / 10000) +
    Math.round((supplierCostCents * affiliateFeeBps) / 10000);

  // Solve for price: price = costs / (1 - targetMargin%)
  const targetMarginFraction = Math.max(0.01, minMarginBps / 10000); // At least 0.1%
  const neededPrice = Math.round(totalCostsInWorstCase / (1 - targetMarginFraction));

  // Round to nearest 50 cents
  return roundToNearest(neededPrice, 50);
}

/**
 * Sensitivity analysis: How much does each factor affect margin?
 */
export function marginSensitivity(
  retailPriceCents: number,
  supplierCostCents: number,
  shippingCostCents: number,
  platformFeeBps: number
): Record<string, number> {
  const baseResult = computeMargin({
    retail_price_cents: retailPriceCents,
    supplier_cost_cents: supplierCostCents,
    shipping_cost_cents: shippingCostCents,
    vat_enabled: true,
    vat_rate_bps: GEORGIA_VAT_BPS,
    platform_fee_bps: platformFeeBps,
    affiliate_bps: 0,
    refund_reserve_bps: 0,
  });

  const baseMarginBps = Math.round(baseResult.margin_percent * 100);

  // Test each factor independently
  const refundResult = computeMargin({
    retail_price_cents: Math.round(retailPriceCents * 0.95), // 5% refund rate
    supplier_cost_cents: supplierCostCents,
    shipping_cost_cents: shippingCostCents,
    vat_enabled: true,
    vat_rate_bps: GEORGIA_VAT_BPS,
    platform_fee_bps: platformFeeBps,
    affiliate_bps: 0,
    refund_reserve_bps: 0,
  });

  const refundImpact = Math.round(refundResult.margin_percent * 100) - baseMarginBps;

  const shippingDelayImpact = -100; // 1% margin per day delay (fixed estimate)

  const competitorResult = computeMargin({
    retail_price_cents: Math.round(retailPriceCents * 0.9), // 10% price cut from competition
    supplier_cost_cents: supplierCostCents,
    shipping_cost_cents: shippingCostCents,
    vat_enabled: true,
    vat_rate_bps: GEORGIA_VAT_BPS,
    platform_fee_bps: platformFeeBps,
    affiliate_bps: 0,
    refund_reserve_bps: 0,
  });

  const competitorCapImpact = Math.round(competitorResult.margin_percent * 100) - baseMarginBps;

  const feesResult = computeMargin({
    retail_price_cents: retailPriceCents,
    supplier_cost_cents: supplierCostCents,
    shipping_cost_cents: shippingCostCents,
    vat_enabled: true,
    vat_rate_bps: GEORGIA_VAT_BPS,
    platform_fee_bps: platformFeeBps + 500, // +5% fee increase
    affiliate_bps: 0,
    refund_reserve_bps: 0,
  });

  const feesIncreaseImpact = Math.round(feesResult.margin_percent * 100) - baseMarginBps;

  return {
    refundRate5Pct: refundImpact,
    shippingDelayPerDay: shippingDelayImpact,
    competitorPrice10PctCut: competitorCapImpact,
    platformFeeIncrease5Pct: feesIncreaseImpact,
  };
}
