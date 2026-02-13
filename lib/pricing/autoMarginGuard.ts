/**
 * Auto-Margin Guard
 * Simulates worst-case margin scenarios before product publication
 * Ensures product doesn't become unprofitable under adverse conditions
 */

import { MarginSimulation, MarginScenario } from './types';
import { computeMargin } from '@/lib/finance/margin';
import { roundToNearest } from '@/lib/finance/money';

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
  const bestCaseMargin = computeMargin(
    retailPriceCents,
    supplierCostCents,
    shippingCostCents,
    platformFeeBps,
    affiliateFeeBps,
    refundReserveBps,
    true // VAT enabled
  );

  // Worst case: multiple bad things happen
  // 1. Refund rate high: Lose revenue on some orders
  const refundLoss = Math.round(
    (retailPriceCents * worseCaseFactors.maxRefundRatePct) / 100
  );

  // 2. Shipping delays increase refund requests
  const delayMargin = Math.max(0, -worseCaseFactors.maxShippingDelayDays * 100); // 100 bps per day

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

  const worstCaseMargin = computeMargin(
    worstCaseEffectivePrice,
    supplierCostCents + additionalCosts,
    shippingCostCents + worseCaseFactors.maxReturnShippingCostCents / 2, // Some customers don't return
    platformFeeBps + additionalFeesBps,
    affiliateFeeBps + 500, // Affiliate fees increase in promotional periods
    refundReserveBps + 500, // Need more buffer
    true
  );

  // Average case: mild adverse conditions
  const avgCaseMargin = computeMargin(
    retailPriceCents - Math.round(retailPriceCents * (worseCaseFactors.competitorPriceCutPct / 100) * 0.3),
    supplierCostCents + worseCaseFactors.maxReturnShippingCostCents / 4,
    shippingCostCents,
    platformFeeBps + additionalFeesBps * 0.5,
    affiliateFeeBps,
    refundReserveBps,
    true
  );

  // Build scenario breakdown
  const scenarios: MarginScenario[] = [
    {
      name: 'Best Case (Normal)',
      probability: 0.60, // 60% of time
      marginBps: bestCaseMargin,
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
      marginBps: avgCaseMargin,
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
      marginBps: worstCaseMargin,
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
  const isApproved = worstCaseMargin >= minAcceptableMarginBps;

  const rejectionReason = !isApproved
    ? `Worst-case margin ${(worstCaseMargin / 100).toFixed(1)}% falls below 5% minimum. Recommended: increase price by ${Math.ceil(
        ((minAcceptableMarginBps - worstCaseMargin) / retailPriceCents) * 10000
      )} bps`
    : undefined;

  return {
    bestCaseMarginBps: bestCaseMargin,
    worstCaseMarginBps: worstCaseMargin,
    avgCaseMarginBps: avgCaseMargin,
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
  const baseMargin = computeMargin(
    retailPriceCents,
    supplierCostCents,
    shippingCostCents,
    platformFeeBps,
    0,
    0,
    true
  );

  // Test each factor independently
  const refundImpact = computeMargin(
    Math.round(retailPriceCents * 0.95), // 5% refund rate
    supplierCostCents,
    shippingCostCents,
    platformFeeBps,
    0,
    0,
    true
  ) - baseMargin;

  const shippingDelayImpact = -100; // 1% margin per day delay (fixed estimate)

  const competitorCapImpact = computeMargin(
    Math.round(retailPriceCents * 0.9), // 10% price cut from competition
    supplierCostCents,
    shippingCostCents,
    platformFeeBps,
    0,
    0,
    true
  ) - baseMargin;

  const feesIncreaseImpact = computeMargin(
    retailPriceCents,
    supplierCostCents,
    shippingCostCents,
    platformFeeBps + 500, // +5% fee increase
    0,
    0,
    true
  ) - baseMargin;

  return {
    refundRate5Pct: refundImpact,
    shippingDelayPerDay: shippingDelayImpact,
    competitorPrice10PctCut: competitorCapImpact,
    platformFeeIncrease5Pct: feesIncreaseImpact,
  };
}
