/**
 * Shipping Intelligence & Risk Scoring
 * Calculates shipping risk impact on margins and conversions
 */

import { ShippingRiskFactors, ShippingRiskScore } from './types';

/**
 * Calculate shipping risk score (0-100, where 100 is highest risk)
 *
 * Risk factors:
 * 1. Long delivery times (> 14 days → higher refund risk)
 * 2. High delay probability (carriers with poor on-time rates)
 * 3. High refund/return rate (customer satisfaction issue)
 *
 * Impact on business:
 * - Long shipping → Lower conversion rate (~1% per week of delay)
 * - High refunds → Margin erosion, reputation damage
 * - Delays → Customer complaints, 1-star reviews
 */
export function computeShippingRiskScore(factors: ShippingRiskFactors): ShippingRiskScore {
  let riskScore = 0;
  let conversionImpact = 0;
  let additionalMarginNeeded = 0;

  // Risk factor 1: Delivery time
  const deliveryDelayDays = Math.max(0, factors.deliveryDaysAvg - 7); // Days over 1 week
  if (deliveryDelayDays > 0) {
    // Each extra day reduces conversion by ~1%
    riskScore += Math.min(deliveryDelayDays * 5, 30); // Cap at 30 points
    conversionImpact += Math.min(deliveryDelayDays * 1, 15); // Max 15% reduction
    additionalMarginNeeded += deliveryDelayDays * 100; // 100 bps per day (1% per day)
  }

  // Risk factor 2: Delay probability
  // 10% chance of delay → 2 points
  // 50% chance → 10 points
  const delayRiskPoints = factors.delayProbability * 20;
  riskScore += Math.min(delayRiskPoints, 25);
  conversionImpact += Math.min(factors.delayProbability * 5, 10);
  additionalMarginNeeded += Math.min(factors.delayProbability * 200, 500);

  // Risk factor 3: Refund rate
  // 5% refund rate is normal
  // 10% is concerning
  // 20%+ is very high
  const excessRefundRate = Math.max(0, factors.refundRatePct - 5);
  riskScore += Math.min(excessRefundRate * 3, 45); // 0-5% excess = 0-15 points

  if (excessRefundRate > 15) {
    // Very high refund rate signals quality or logistics issues
    riskScore += 30;
    conversionImpact += 20; // Large conversion hit from bad reviews
    additionalMarginNeeded += 2000; // 20% extra margin needed
  } else if (excessRefundRate > 10) {
    conversionImpact += 10;
    additionalMarginNeeded += 1000; // 10% extra margin
  } else if (excessRefundRate > 5) {
    conversionImpact += 5;
    additionalMarginNeeded += 500; // 5% extra margin
  }

  // Clamp risk score to 0-100
  riskScore = Math.min(100, Math.max(0, riskScore));

  // Determine recommendation
  let recommendation = '';
  if (riskScore >= 70) {
    recommendation = 'High risk: Consider switching carriers or adjusting product strategy (higher margin target).';
  } else if (riskScore >= 40) {
    recommendation =
      'Medium-high risk: Add extra margin buffer (200-500 bps) and monitor refund rates. Consider premium shipping options.';
  } else if (riskScore >= 20) {
    recommendation =
      'Medium risk: Acceptable for most products. Monitor delivery performance. Consider 50-200 bps margin buffer.';
  } else {
    recommendation = 'Low risk: Shipping is a competitive advantage. Safe to operate at lower margins.';
  }

  return {
    riskScore: Math.round(riskScore),
    conversionImpact: Math.round(conversionImpact * 10) / 10, // 1 decimal
    recommendedMarginAdditionalBps: Math.round(additionalMarginNeeded),
    recommendation,
  };
}

/**
 * Estimate carrier reliability score (0-100)
 * Higher = more reliable
 *
 * Based on:
 * - On-time delivery rate
 * - Customer complaint rate
 * - Return/refund rate
 */
export function carrierReliabilityScore(
  onTimeRate: number, // 0-1 (e.g., 0.95 = 95% on-time)
  complaintRate: number, // 0-1
  refundRate: number // 0-1
): number {
  // On-time delivery: 50% of score
  const onTimeScore = onTimeRate * 50;

  // Complaint handling: 30% of score
  const complaintScore = (1 - complaintRate) * 30;

  // Refund rate: 20% of score
  const refundScore = (1 - Math.min(refundRate, 0.1)) * 20; // Normalize to 10% max

  return Math.round(onTimeScore + complaintScore + refundScore);
}

/**
 * Recommend optimal carrier based on product characteristics
 */
export function recommendCarrier(
  productType: 'standard' | 'fragile' | 'perishable' | 'dangerous',
  targetDeliveryDays: number
): string {
  // Mock carrier recommendation (in real system, would query database)
  const recommendations: Record<string, string> = {
    'standard_5': 'Express Ground (2-3 days, ₾3-5 per unit)',
    'standard_7': 'Standard Ground (4-7 days, ₾1-2 per unit)',
    'fragile_3': 'Premium Express (1-2 days, ₾8-12 per unit, fragile-safe packaging)',
    'perishable_1': 'Overnight Express (1 day, ₾15-20 per unit, temperature-controlled)',
  };

  const key = `${productType}_${Math.min(targetDeliveryDays, 7)}`;
  return recommendations[key] || 'Standard Ground (default)';
}

/**
 * Calculate cost-to-margin tradeoff for shipping
 *
 * Example:
 * - Standard shipping (₾2): 2% margin hit, 7-day delivery
 * - Express (₾5): 5% margin hit, 2-day delivery
 * - Premium (₾8): 8% margin hit, 1-day delivery (10% conversion boost)
 */
export function shippingMarginTradeoff(
  productMarginBps: number,
  shippingCostCents: number | number[], // Single cost or array of options
  deliveryDaysAvg: number | number[]
): {
  shippingCost: number;
  resultingMarginBps: number;
  deliveryDays: number;
  recommendation: string;
}[] {
  const costs = Array.isArray(shippingCostCents) ? shippingCostCents : [shippingCostCents];
  const days = Array.isArray(deliveryDaysAvg) ? deliveryDaysAvg : [deliveryDaysAvg];

  if (costs.length !== days.length) {
    return [];
  }

  return costs.map((cost, idx) => {
    const dayOption = days[idx] || 7; // Default to 7 days if undefined
    const costBps = Math.round((cost / 10000) * 10000); // Convert to bps

    // Shipping cost reduces margin
    const resultingMarginBps = productMarginBps - costBps;

    // Faster delivery can increase conversion (simplified model)
    const conversionBoost = Math.max(0, (7 - dayOption) * 2); // 2% per day faster than standard 7-day

    let recommendation = '';
    if (resultingMarginBps < 1000) {
      recommendation = 'Too expensive - margin becomes unprofitable';
    } else if (conversionBoost > 10) {
      recommendation = `Recommended - ${conversionBoost.toFixed(0)}% estimated conversion boost justifies cost`;
    } else {
      recommendation = 'Acceptable option';
    }

    return {
      shippingCost: cost,
      resultingMarginBps,
      deliveryDays: dayOption,
      recommendation,
    };
  });
}

/**
 * Shipping strategy: pick optimal carrier mix for product
 */
export function optimizeShippingStrategy(
  productType: 'standard' | 'fragile' | 'perishable' | 'dangerous',
  targetMarginBps: number,
  maxDeliveryDays: number
): {
  recommendedCarrier: string;
  estimatedShippingCostCents: number;
  estimatedRiskScore: number;
} {
  const carrier = recommendCarrier(productType, maxDeliveryDays);

  // Mock cost estimation (in real system, would query actual carrier rates)
  let shippingCost = 200; // Default 200 cents (₾2)
  if (maxDeliveryDays <= 2) shippingCost = 800;
  else if (maxDeliveryDays <= 5) shippingCost = 400;

  // Estimate risk based on delivery days
  const riskFactors: ShippingRiskFactors = {
    deliveryDaysAvg: maxDeliveryDays,
    delayProbability: Math.max(0.05, maxDeliveryDays / 20), // 5% base + 5% per day
    refundRatePct: 5 + maxDeliveryDays, // 5% base + 1% per day delay
    carrierId: 'standard',
  };

  const riskScore = computeShippingRiskScore(riskFactors);

  return {
    recommendedCarrier: carrier,
    estimatedShippingCostCents: shippingCost,
    estimatedRiskScore: riskScore.riskScore,
  };
}
