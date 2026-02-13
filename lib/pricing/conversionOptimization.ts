/**
 * Conversion Rate Optimization (CRO) Module
 * Tracks conversion funnel and suggests optimizations
 */

import {
  ConversionMetrics,
  ConversionAnalysis,
  ConversionSuggestion,
} from './types';

/**
 * Analyze conversion funnel to identify bottlenecks
 * Funnel: Impressions → Clicks → Cart Adds → Purchases
 */
export function analyzeConversionFunnel(metrics: ConversionMetrics): ConversionAnalysis {
  // Calculate rates
  const conversionRate = metrics.impressions > 0
    ? (metrics.purchases / metrics.impressions) * 100
    : 0;

  const clickToCartRate = metrics.clicks > 0
    ? (metrics.cartAdds / metrics.clicks) * 100
    : 0;

  const cartToOrderRate = metrics.cartAdds > 0
    ? (metrics.purchases / metrics.cartAdds) * 100
    : 0;

  // Identify bottleneck (which step loses the most people)
  const impressionToClickRate = metrics.impressions > 0
    ? (metrics.clicks / metrics.impressions) * 100
    : 0;

  let bottleneck: 'awareness' | 'interest' | 'decision' = 'awareness';

  if (impressionToClickRate >= 3) {
    // Good click-through
    if (clickToCartRate < 20) {
      bottleneck = 'interest'; // People click but don't add to cart
    } else if (cartToOrderRate < 50) {
      bottleneck = 'decision'; // People add to cart but don't buy
    }
  }

  // Generate suggestions based on bottleneck
  const suggestions = generateSuggestions(
    bottleneck,
    metrics,
    impressionToClickRate,
    clickToCartRate,
    cartToOrderRate
  );

  return {
    conversionRate,
    clickToCartRate,
    cartToOrderRate,
    suggestions,
    bottleneck,
  };
}

/**
 * Generate optimization suggestions based on bottleneck
 */
function generateSuggestions(
  bottleneck: 'awareness' | 'interest' | 'decision',
  metrics: ConversionMetrics,
  impressionToClickRate: number,
  clickToCartRate: number,
  cartToOrderRate: number
): ConversionSuggestion[] {
  const suggestions: ConversionSuggestion[] = [];

  if (bottleneck === 'awareness') {
    // Problem: Not enough people clicking on the product
    suggestions.push({
      type: 'title',
      priority: 'high',
      expectedImpact: 25, // 25% potential improvement
      action: 'Improve product title with keywords and power words ("Best-selling", "Limited stock")',
    });

    suggestions.push({
      type: 'images',
      priority: 'high',
      expectedImpact: 30,
      action: 'Add high-quality lifestyle images showing product in use; add comparison to competitor products',
    });

    if (metrics.clicks < metrics.impressions * 0.02) {
      // CTR < 2% is very low
      suggestions.push({
        type: 'description',
        priority: 'medium',
        expectedImpact: 15,
        action: 'Add compelling benefits summary and unique selling points above the fold',
      });
    }
  } else if (bottleneck === 'interest') {
    // Problem: People click but don't add to cart
    suggestions.push({
      type: 'price',
      priority: 'high',
      expectedImpact: 20,
      action: 'Test 5-10% price reduction or offer "Free shipping on orders over ₾50"',
    });

    suggestions.push({
      type: 'images',
      priority: 'high',
      expectedImpact: 18,
      action: 'Add more detailed product images (close-ups, size reference, material quality)',
    });

    suggestions.push({
      type: 'description',
      priority: 'medium',
      expectedImpact: 12,
      action: 'Add customer reviews and FAQ section addressing common questions',
    });

    if (clickToCartRate < 5) {
      suggestions.push({
        type: 'affiliate',
        priority: 'medium',
        expectedImpact: 15,
        action: 'Enable affiliate bonuses (5-10% extra commission for promoters)',
      });
    }
  } else if (bottleneck === 'decision') {
    // Problem: People add to cart but don't checkout
    suggestions.push({
      type: 'price',
      priority: 'high',
      expectedImpact: 25,
      action: 'Reduce price by 3-5% or add bundle discount "Buy 2+ save 10%"',
    });

    suggestions.push({
      type: 'affiliate',
      priority: 'high',
      expectedImpact: 20,
      action: 'Boost affiliate commission by +5% to drive promoter activity and urgency',
    });

    if (cartToOrderRate < 30) {
      suggestions.push({
        type: 'description',
        priority: 'medium',
        expectedImpact: 10,
        action: 'Add trust signals: "Money-back guarantee", "Shipped within 24 hours", "10K+ sold"',
      });
    }
  }

  // Sort by priority and expected impact
  return suggestions.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.expectedImpact - a.expectedImpact;
  });
}

/**
 * Estimate revenue impact of suggested optimization
 * @param baseRevenue Current monthly revenue
 * @param currentMetrics Current conversion metrics
 * @param appliedSuggestion Applied suggestion
 * @returns Estimated new revenue
 */
export function estimateRevenueImpact(
  baseRevenue: number,
  currentMetrics: ConversionMetrics,
  appliedSuggestion: ConversionSuggestion
): number {
  // Each suggestion can improve conversions by estimated amount
  const currentConversionRate = currentMetrics.impressions > 0
    ? (currentMetrics.purchases / currentMetrics.impressions) * 100
    : 0;

  const improvementMultiplier = 1 + appliedSuggestion.expectedImpact / 100;
  const newConversionRate = currentConversionRate * improvementMultiplier;

  // Assume: impressions stay same, but conversion rate improves
  const conversionRateImprovement = newConversionRate - currentConversionRate;
  const additionalPurchases = (currentMetrics.impressions * conversionRateImprovement) / 100;

  // Assume average order value (placeholder, would come from merchant data)
  const avgOrderValue = baseRevenue / Math.max(currentMetrics.purchases, 1);

  return baseRevenue + additionalPurchases * avgOrderValue;
}

/**
 * Quick diagnostic: Rate the health of conversion funnel
 */
export function diagnoseConversionHealth(metrics: ConversionMetrics): 'excellent' | 'good' | 'fair' | 'poor' {
  const analysis = analyzeConversionFunnel(metrics);

  // Benchmarks (typical for Georgian e-commerce)
  if (analysis.conversionRate > 10) return 'excellent';
  if (analysis.conversionRate > 5) return 'good';
  if (analysis.conversionRate > 2) return 'fair';
  return 'poor';
}

/**
 * Recommend A/B test based on bottleneck
 */
export function recommendABTest(analysis: ConversionAnalysis): {
  test: string;
  duration: number; // days
  sampleSize: number; // min conversions before deciding
} {
  const tests: Record<string, { duration: number; sampleSize: number }> = {
    awareness: { duration: 7, sampleSize: 50 }, // Short test, larger sample needed
    interest: { duration: 10, sampleSize: 75 },
    decision: { duration: 14, sampleSize: 100 }, // Longer test, higher commitment
  };

  const test = tests[analysis.bottleneck];

  return {
    test: `A/B test for ${analysis.bottleneck} bottleneck`,
    ...test,
  };
}
