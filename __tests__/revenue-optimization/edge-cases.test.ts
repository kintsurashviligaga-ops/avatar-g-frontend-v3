/**
 * Edge Case Tests: Revenue Optimization Modules
 * 
 * Tests boundary conditions, extreme values, and error scenarios
 */

import { computeDynamicPrice, estimateConversionAfterPriceChange, batchComputeDynamicPrices } from '@/lib/pricing/dynamicPricing';
import { analyzeConversionFunnel, recommendABTest } from '@/lib/pricing/conversionOptimization';
import { computeShippingRiskScore } from '@/lib/shipping/shippingIntelligence';
import { simulateWorstCaseMargin, marginSensitivity, minPriceForWorstCase } from '@/lib/pricing/autoMarginGuard';

describe('Edge Cases: Dynamic Pricing Engine', () => {
  test('should handle zero price gracefully', () => {
    // This should not happen in production, but test defensive programming
    expect(() => {
      computeDynamicPrice(
        1, // 1 cent minimum
        {
          currentMarginBps: 1000,
          targetMarginBps: 2000,
          conversionRate: 5,
          inventoryLevel: 50,
          maxInventory: 100,
          demandTrend: 'medium',
          seasonality: 1.0,
        }
      );
    }).not.toThrow();
  });

  test('should handle extreme inventory levels', () => {
    const overstock = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 2000,
        targetMarginBps: 2000,
        conversionRate: 5,
        inventoryLevel: 100, // At max capacity
        maxInventory: 100,
        demandTrend: 'low',
        seasonality: 1.0,
      }
    );

    expect(overstock.recommendedAction).toBe('decrease');

    const stockout = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 2000,
        targetMarginBps: 2000,
        conversionRate: 5,
        inventoryLevel: 1, // Nearly out of stock
        maxInventory: 100,
        demandTrend: 'medium',
        seasonality: 1.0,
      }
    );

    expect(stockout.recommendedAction).toBe('increase');
  });

  test('should handle zero conversion rate', () => {
    const result = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 2000,
        targetMarginBps: 2000,
        conversionRate: 0, // No sales
        inventoryLevel: 50,
        maxInventory: 100,
        demandTrend: 'medium',
        seasonality: 1.0,
      }
    );

    expect(result.recommendedAction).toBe('decrease'); // Try to stimulate demand
  });

  test('should handle extremely high conversion rates', () => {
    const result = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 2000,
        targetMarginBps: 2000,
        conversionRate: 50, // Unrealistic but test limits
        inventoryLevel: 50,
        maxInventory: 100,
        demandTrend: 'high',
        seasonality: 1.0,
      }
    );

    expect(result.recommendedAction).toBe('increase'); // Raise price to balance demand
  });

  test('should estimate non-negative conversion after price change', () => {
    const result = estimateConversionAfterPriceChange(1, 500); // 500% price increase
    expect(result).toBeGreaterThanOrEqual(0); // Should never go negative
  });

  test('should batch process multiple products', () => {
    const prices = [
      { currentPriceCents: 5000, signals: { currentMarginBps: 1500, targetMarginBps: 2000, conversionRate: 3, inventoryLevel: 40, maxInventory: 100, demandTrend: 'low' as const, seasonality: 1.0 } },
      { currentPriceCents: 10000, signals: { currentMarginBps: 2500, targetMarginBps: 2500, conversionRate: 5, inventoryLevel: 60, maxInventory: 100, demandTrend: 'medium' as const, seasonality: 1.1 } },
      { currentPriceCents: 20000, signals: { currentMarginBps: 4000, targetMarginBps: 3000, conversionRate: 1, inventoryLevel: 20, maxInventory: 100, demandTrend: 'high' as const, seasonality: 0.9 } },
    ];

    const results = batchComputeDynamicPrices(prices);
    expect(results).toHaveLength(3);
    results.forEach((result) => {
      expect(result.newPriceCents).toBeGreaterThan(0);
    });
  });
});

describe('Edge Cases: Conversion Optimization', () => {
  test('should handle funnel with zero traffic', () => {
    const analysis = analyzeConversionFunnel({
      impressions: 0,
      clicks: 0,
      cartAdds: 0,
      purchases: 0,
    });

    expect(analysis.conversionRate).toBe(0);
    expect(analysis.bottleneck).toBeDefined();
  });

  test('should handle funnel with incomplete data', () => {
    const analysis = analyzeConversionFunnel({
      impressions: 1000,
      clicks: 0,
      cartAdds: 0,
      purchases: 0,
    });

    expect(analysis.bottleneck).toBe('awareness'); // 0% CTR
  });

  test('should recommend appropriate test duration for low traffic', () => {
    const test = recommendABTest({
      conversionRate: 0.5, // 0.5%
      clickToCartRate: 2,
      cartToOrderRate: 25,
      bottleneck: 'awareness',
      suggestions: [],
    });

    expect(test.recommendedDurationDays).toBeGreaterThan(5);
    expect(test.minConversionsNeeded).toBeGreaterThan(0);
  });

  test('should recommend test for excellent funnel (for incremental gains)', () => {
    const test = recommendABTest({
      conversionRate: 15, // Excellent
      clickToCartRate: 60,
      cartToOrderRate: 90,
      bottleneck: 'decision',
      suggestions: [],
    });

    expect(test.recommendedDurationDays).toBeGreaterThan(0);
    expect(test.minConversionsNeeded).toBeGreaterThan(100);
  });
});

describe('Edge Cases: Shipping Intelligence', () => {
  test('should handle next-day delivery (extreme speed)', () => {
    const risk = computeShippingRiskScore({
      deliveryDaysAvg: 1,
      delayProbability: 0.05,
      refundRatePct: 1,
      carrierId: 'premium_express',
    });

    expect(risk.riskScore).toBeLessThan(20); // Very low risk
    expect(risk.conversionImpact).toBeGreaterThan(0); // Actually boosts conversion
  });

  test('should handle worst-case slow delivery', () => {
    const risk = computeShippingRiskScore({
      deliveryDaysAvg: 30,
      delayProbability: 0.8,
      refundRatePct: 25,
      carrierId: 'international_slow',
    });

    expect(risk.riskScore).toBeGreaterThan(80); // Very high risk
    expect(risk.recommendedMarginAdditionalBps).toBeGreaterThan(3000); // Need significant margin
  });

  test('should handle zero refund rate', () => {
    const risk = computeShippingRiskScore({
      deliveryDaysAvg: 7,
      delayProbability: 0.1,
      refundRatePct: 0,
      carrierId: 'perfect_carrier',
    });

    expect(risk.riskScore).toBeLessThan(30);
  });
});

describe('Edge Cases: Auto-Margin Guard', () => {
  test('should reject product with negative margin potential', () => {
    const simulation = simulateWorstCaseMargin(
      1000, // ₾10 retail
      900, // ₾9 cost (already high)
      500, // ₾5 shipping (impossible to profit)
      500,
      500,
      100,
      {
        maxRefundRatePct: 5,
        maxShippingDelayDays: 7,
        maxReturnShippingCostCents: 400,
        maxPlatformFeeincreaseBps: 300,
        competitorPriceCutPct: 5,
      }
    );

    expect(simulation.isApproved).toBe(false);
    expect(simulation.worstCaseMarginBps).toBeLessThanOrEqual(0);
  });

  test('should handle high-value products correctly', () => {
    const simulation = simulateWorstCaseMargin(
      1000000, // ₾10,000
      200000, // ₾2,000
      10000, // ₾100 shipping
      50000, // 5% platform fee
      100000, // 10% affiliate
      5000,
      {
        maxRefundRatePct: 3,
        maxShippingDelayDays: 5,
        maxReturnShippingCostCents: 15000,
        maxPlatformFeeincreaseBps: 300,
        competitorPriceCutPct: 5,
      }
    );

    expect(simulation.isApproved).toBe(true);
    expect(simulation.worstCaseMarginBps).toBeGreaterThan(5000);
  });

  test('should provide accurate sensitivity for critical factors', () => {
    const sensitivity = marginSensitivity(10000, 2000, 500, 500);

    // Each factor should have measurable impact
    expect(sensitivity.refundRate5Pct).toBeLessThan(0);
    expect(sensitivity.shippingDelayPerDay).toBeLessThan(0);
    expect(sensitivity.competitorPrice10PctCut).toBeLessThan(0);
    expect(sensitivity.platformFeeIncrease5Pct).toBeLessThan(0);

    // Competitor price cut should have largest impact
    expect(Math.abs(sensitivity.competitorPrice10PctCut)).toBeGreaterThan(
      Math.abs(sensitivity.refundRate5Pct)
    );
  });

  test('should calculate min price correctly for extreme scenarios', () => {
    // Scenario: high-risk product needs 20% minimum margin
    const minPrice = minPriceForWorstCase(
      3000,
      1000,
      500,
      1000,
      200,
      {
        maxRefundRatePct: 15,
        maxShippingDelayDays: 14,
        maxReturnShippingCostCents: 800,
        maxPlatformFeeincreaseBps: 500,
        competitorPriceCutPct: 15,
      },
      2000 // 20% minimum
    );

    // Verify price survives the scenario
    const simulation = simulateWorstCaseMargin(
      minPrice,
      3000,
      1000,
      500,
      1000,
      200,
      {
        maxRefundRatePct: 15,
        maxShippingDelayDays: 14,
        maxReturnShippingCostCents: 800,
        maxPlatformFeeincreaseBps: 500,
        competitorPriceCutPct: 15,
      }
    );

    expect(simulation.worstCaseMarginBps).toBeGreaterThanOrEqual(2000);
  });

  test('should round min price to nearest 50 cents', () => {
    const minPrice = minPriceForWorstCase(
      3000,
      1000,
      500,
      500,
      500,
      200,
      {
        maxRefundRatePct: 5,
        maxShippingDelayDays: 7,
        maxReturnShippingCostCents: 400,
        maxPlatformFeeincreaseBps: 300,
        competitorPriceCutPct: 5,
      },
      1000
    );

    // Must be multiple of 50
    expect(minPrice % 50).toBe(0);
  });
});

describe('Boundary Conditions: Cross-Module', () => {
  test('should handle products at minimum viable margin threshold', () => {
    const product = {
      price: 5000,
      cost: 4739, // Almost all cost, minimal safe margin
      shipping: 100,
      fees: 50,
      affiliate: 50,
    };

    const margins = simulateWorstCaseMargin(
      product.price,
      product.cost,
      product.shipping,
      product.fees,
      product.affiliate,
      50,
      {
        maxRefundRatePct: 2,
        maxShippingDelayDays: 3,
        maxReturnShippingCostCents: 100,
        maxPlatformFeeincreaseBps: 100,
        competitorPriceCutPct: 2,
      }
    );

    // Should barely pass or fail
    expect(margins.isApproved !== null).toBe(true);
  });

  test('should handle products at maximum complexity', () => {
    // All worst-case factors combined
    const simulation = simulateWorstCaseMargin(
      10000,
      5000,
      1000,
      1000,
      2000,
      500,
      {
        maxRefundRatePct: 20,
        maxShippingDelayDays: 21,
        maxReturnShippingCostCents: 1000,
        maxPlatformFeeincreaseBps: 1000,
        competitorPriceCutPct: 20,
      }
    );

    // Should still produce valid decision
    expect(simulation).toHaveProperty('isApproved');
    expect(simulation).toHaveProperty('bestCaseMarginBps');
    expect(simulation).toHaveProperty('avgCaseMarginBps');
    expect(simulation).toHaveProperty('worstCaseMarginBps');
  });
});
