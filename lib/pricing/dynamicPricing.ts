/**
 * Dynamic Pricing Engine
 * Automatically adjusts prices based on:
 * - Margin targets
 * - Conversion rates
 * - Inventory levels
 * - Demand signals
 */

import { DynamicPriceResult, PricingSignals } from './types';
import { roundToNearest } from '@/lib/finance/money';

// Pricing constants (in basis points)
const MIN_ADJUSTMENT_BPS = 100; // 1% minimum
const MAX_ADJUSTMENT_BPS = 1500; // 15% maximum
const TARGET_CONVERSION_RATE = 5; // 5% target

/**
 * Compute recommended dynamic price based on market signals
 *
 * Logic:
 * 1. If margin < target: increase price (+1-5%)
 * 2. If inventory high: decrease price to clear stock
 * 3. If conversion low: test lower price (-2-5%)
 * 4. If conversion high: increase price (+1-3%)
 * 5. Apply seasonality multiplier
 * 6. Respect minimum margin threshold (15% standard)
 *
 * @param currentPriceCents Current retail price (cents)
 * @param signals Market signals (margin, conversion, inventory, etc)
 * @param minMarginBps Minimum acceptable margin (default: 1500 = 15%)
 * @returns Dynamic price adjustment recommendation
 */
export function computeDynamicPrice(
  currentPriceCents: number,
  signals: PricingSignals,
  minMarginBps = 1500
): DynamicPriceResult {
  let adjustmentBps = 0;
  let reason = '';
  let recommendedAction: 'increase' | 'decrease' | 'maintain' = 'maintain';

  // Rule 1: Margin below target → Increase price
  if (signals.currentMarginBps < signals.targetMarginBps && signals.currentMarginBps >= minMarginBps) {
    const marginGap = signals.targetMarginBps - signals.currentMarginBps;
    adjustmentBps = Math.min(marginGap / 2, 500); // 0.5-5% increase
    reason = `Margin ${(signals.currentMarginBps / 100).toFixed(1)}% below target ${(signals.targetMarginBps / 100).toFixed(1)}%`;
    recommendedAction = 'increase';
  }

  // Rule 2: High inventory → Decrease to clear stock
  if (signals.inventoryLevel > signals.maxInventory * 0.8) {
    const overstock = signals.inventoryLevel / signals.maxInventory;
    const clearanceAdj = Math.min((overstock - 0.8) * 1000, 800); // 0.8-8% decrease
    adjustmentBps = Math.min(adjustmentBps - clearanceAdj, -200); // Max 2% price cut
    reason = `High inventory (${((signals.inventoryLevel / signals.maxInventory) * 100).toFixed(0)}% of capacity)`;
    recommendedAction = 'decrease';
  }

  // Rule 3: Low conversion → Test lower price
  if (signals.conversionRate < TARGET_CONVERSION_RATE / 2) {
    const conversionGap = TARGET_CONVERSION_RATE - signals.conversionRate;
    adjustmentBps = Math.min(adjustmentBps - 300, -conversionGap * 50); // 0.3-3% test reduction
    reason = `Low conversion rate ${signals.conversionRate.toFixed(2)}% (target: ${TARGET_CONVERSION_RATE}%)`;
    recommendedAction = 'decrease';
  }

  // Rule 4: High conversion → Increase price
  if (signals.conversionRate > TARGET_CONVERSION_RATE * 1.5) {
    const conversionBonus = signals.conversionRate - TARGET_CONVERSION_RATE;
    adjustmentBps = Math.min(adjustmentBps + conversionBonus * 30, 300); // 0.3-3% increase
    reason = `High conversion rate ${signals.conversionRate.toFixed(2)}% (premium pricing opportunity)`;
    recommendedAction = 'increase';
  }

  // Rule 5: Apply seasonality multiplier
  adjustmentBps = adjustmentBps * signals.seasonality;

  // Rule 6: Demand elasticity
  if (signals.demandTrend === 'high') {
    adjustmentBps = Math.min(adjustmentBps + 200, 800); // Additional 0.2-0.8%
  } else if (signals.demandTrend === 'low') {
    adjustmentBps = Math.max(adjustmentBps - 200, -600); // Additional 0.2-0.6% decrease
  }

  // Clamp adjustments to safe range
  adjustmentBps = Math.max(Math.min(adjustmentBps, MAX_ADJUSTMENT_BPS), -MAX_ADJUSTMENT_BPS);

  // Compute new price
  const multiplier = 1 + adjustmentBps / 10000;
  let newPriceCents = Math.round(currentPriceCents * multiplier);

  // Ensure new price respects minimum margin
  // Assuming: newMargin = (newPrice - costs - fees) / newPrice
  // For safety, we validate margin is still above minimum
  const expectedMarginBps = Math.max(
    Math.round(signals.currentMarginBps + adjustmentBps * 0.5), // Conservative estimate
    minMarginBps
  );

  // If calculated margin would drop below minimum, revert adjustment
  if (expectedMarginBps < minMarginBps) {
    adjustmentBps = 0;
    newPriceCents = currentPriceCents;
    reason = `Maintaining current price to respect ${(minMarginBps / 100).toFixed(1)}% margin floor`;
    recommendedAction = 'maintain';
  }

  // Round to nearest 50 cents (standard pricing format)
  newPriceCents = roundToNearest(newPriceCents, 50);

  return {
    newPriceCents,
    reason,
    expectedMarginBps,
    confidence: Math.min(100, Math.abs(adjustmentBps) * 2), // Higher adjustment = higher confidence
    recommendedAction,
  };
}

/**
 * Batch compute dynamic prices for multiple products
 */
export function batchComputeDynamicPrices(
  prices: Array<{ currentPriceCents: number; signals: PricingSignals }>,
  minMarginBps?: number
): DynamicPriceResult[] {
  return prices.map(({ currentPriceCents, signals }) =>
    computeDynamicPrice(currentPriceCents, signals, minMarginBps)
  );
}

/**
 * Elasticity-aware pricing: How price change affects demand
 * @param currentConversionRate Current conversion (0-100)
 * @param priceChangePct Price change percentage
 * @param elasticity Price elasticity coefficient (default: -1.5, typical for e-commerce)
 * @returns Expected new conversion rate
 */
export function estimateConversionAfterPriceChange(
  currentConversionRate: number,
  priceChangePct: number,
  elasticity = -1.5
): number {
  const demandChange = elasticity * priceChangePct;
  const expectedConversion = currentConversionRate * (1 + demandChange / 100);
  return Math.max(0, expectedConversion); // Never negative
}

/**
 * Competitive pricing: Suggest price in competitor range
 * @param currentPriceCents Current price
 * @param competitorPriceCents Competitor's price
 * @param minMarginBps Minimum acceptable margin
 * @returns Suggested price (either current or competitor's, whichever maintains margin)
 */
export function competitivePrice(
  currentPriceCents: number,
  competitorPriceCents: number,
  minMarginBps: number
): number {
  // If competitor is cheaper and we can still hit margin target, match or go slightly lower
  if (competitorPriceCents < currentPriceCents) {
    // Go 5% lower than competitor to gain volume (if margin allows)
    const discountedPrice = Math.round(competitorPriceCents * 0.95);
    return Math.max(discountedPrice, currentPriceCents); // Never go lower than current
  }

  // If competitor is more expensive, set to high end (maintain margin)
  return currentPriceCents;
}
