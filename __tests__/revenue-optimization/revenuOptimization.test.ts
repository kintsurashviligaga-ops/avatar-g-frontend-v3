/**
 * Tests for Revenue Optimization Phase 2 Modules
 */

import { computeDynamicPrice, estimateConversionAfterPriceChange, competitivePrice } from '@/lib/pricing/dynamicPricing';
import { analyzeConversionFunnel, diagnoseConversionHealth, estimateRevenueImpact } from '@/lib/pricing/conversionOptimization';
import { computeShippingRiskScore, carrierReliabilityScore, optimizeShippingStrategy } from '@/lib/shipping/shippingIntelligence';
import { simulateWorstCaseMargin, minPriceForWorstCase, marginSensitivity } from '@/lib/pricing/autoMarginGuard';

describe('Dynamic Pricing Engine', () => {
  test('should increase price when margin below target', () => {
    const result = computeDynamicPrice(
      10000, // ₾100
      {
        currentMarginBps: 1000, // 10%
        targetMarginBps: 1500, // 15%
        conversionRate: 5,
        inventoryLevel: 20,
        maxInventory: 100,
        demandTrend: 'medium',
        seasonality: 1.0,
      }
    );

    expect(result.recommendedAction).toBe('increase');
    expect(result.newPriceCents).toBeGreaterThan(10000);
    expect(result.reason).toContain('below target');
  });

  test('should decrease price when inventory high', () => {
    const result = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 2000,
        targetMarginBps: 1500,
        conversionRate: 5,
        inventoryLevel: 90, // 90% of capacity
        maxInventory: 100,
        demandTrend: 'low',
        seasonality: 1.0,
      }
    );

    expect(result.recommendedAction).toBe('decrease');
    expect(result.newPriceCents).toBeLessThan(10000);
  });

  test('should decrease price for low conversion', () => {
    const result = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 3000,
        targetMarginBps: 2000,
        conversionRate: 1, // Very low
        inventoryLevel: 30,
        maxInventory: 100,
        demandTrend: 'low',
        seasonality: 1.0,
      }
    );

    expect(result.recommendedAction).toBe('decrease');
    expect(result.reason).toContain('Low conversion');
  });

  test('should respect minimum margin floor', () => {
    const result = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 500, // Well below minimums
        targetMarginBps: 1500,
        conversionRate: 5,
        inventoryLevel: 20,
        maxInventory: 100,
        demandTrend: 'medium',
        seasonality: 1.0,
      },
      1000 // Minimum 10%
    );

    expect(result.recommendedAction).toBe('maintain');
    expect(result.newPriceCents).toBe(10000);
  });

  test('should estimate conversion after price change', () => {
    const newConversion = estimateConversionAfterPriceChange(5, -10); // 10% price cut
    expect(newConversion).toBeGreaterThan(5); // Should increase demand
  });

  test('should match competitor price when beneficial', () => {
    const result = competitivePrice(
      10000, // Current price
      8000, // Competitor cheaper
      1500 // Min margin req
    );
    expect(result).toBeLessThanOrEqual(10000);
  });
});

describe('Conversion Optimization', () => {
  test('should identify awareness bottleneck when CTR low', () => {
    const analysis = analyzeConversionFunnel({
      impressions: 1000,
      clicks: 15, // 1.5% CTR
      cartAdds: 5,
      purchases: 1,
    });

    expect(analysis.bottleneck).toBe('awareness');
    expect(analysis.suggestions.length).toBeGreaterThan(0);
    expect(analysis.suggestions[0].type).toBe('title');
  });

  test('should identify interest bottleneck when click-to-cart low', () => {
    const analysis = analyzeConversionFunnel({
      impressions: 1000,
      clicks: 100,
      cartAdds: 8, // 8% click-to-cart
      purchases: 4,
    });

    expect(analysis.bottleneck).toBe('interest');
    expect(analysis.suggestions[0].type).toMatch(/title|images|price/);
  });

  test('should identify decision bottleneck when cart-to-order low', () => {
    const analysis = analyzeConversionFunnel({
      impressions: 1000,
      clicks: 100,
      cartAdds: 50,
      purchases: 10, // 20% cart-to-order
    });

    expect(analysis.bottleneck).toBe('decision');
    expect(analysis.suggestions[0].priority).toBe('high');
  });

  test('should diagnose conversion health correctly', () => {
    const excellent = diagnoseConversionHealth({
      impressions: 1000,
      clicks: 500,
      cartAdds: 300,
      purchases: 120, // 12% conversion
    });
    expect(excellent).toBe('excellent');

    const good = diagnoseConversionHealth({
      impressions: 1000,
      clicks: 200,
      cartAdds: 60,
      purchases: 50, // 5% conversion
    });
    expect(good).toBe('good');
  });

  test('should estimate revenue impact of optimization', () => {
    const baseRevenue = 100000;
    const metrics = {
      impressions: 1000,
      clicks: 50,
      cartAdds: 10,
      purchases: 5,
    };
    const suggestion = {
      type: 'title' as const,
      priority: 'high' as const,
      expectedImpact: 25,
      action: 'Improve title',
    };

    const newRevenue = estimateRevenueImpact(baseRevenue, metrics, suggestion);
    expect(newRevenue).toBeGreaterThan(baseRevenue);
  });
});

describe('Shipping Intelligence', () => {
  test('should score shipping risk correctly', () => {
    const riskScore = computeShippingRiskScore({
      deliveryDaysAvg: 7,
      delayProbability: 0.1,
      refundRatePct: 5,
      carrierId: 'standard',
    });

    expect(riskScore.riskScore).toBeLessThan(30); // Low risk
    expect(riskScore.conversionImpact).toBeLessThan(10);
  });

  test('should penalize long delivery times', () => {
    const riskScore = computeShippingRiskScore({
      deliveryDaysAvg: 21, // 3 weeks
      delayProbability: 0.3,
      refundRatePct: 15, // High refund due to delays
      carrierId: 'slow_carrier',
    });

    expect(riskScore.riskScore).toBeGreaterThan(50); // High risk
    expect(riskScore.conversionImpact).toBeGreaterThan(15);
    expect(riskScore.recommendedMarginAdditionalBps).toBeGreaterThan(1000); // Need extra margin
  });

  test('should calculate carrier reliability score', () => {
    const excellent = carrierReliabilityScore(0.98, 0.01, 0.03);
    expect(excellent).toBeGreaterThan(90);

    const poor = carrierReliabilityScore(0.80, 0.1, 0.15);
    expect(poor).toBeLessThan(70);
  });

  test('should optimize shipping strategy', () => {
    const strategy = optimizeShippingStrategy('standard', 2000, 7);

    expect(strategy.recommendedCarrier).toBeTruthy();
    expect(strategy.estimatedShippingCostCents).toBeGreaterThan(0);
    expect(strategy.estimatedRiskScore).toBeLessThan(100);
  });
});

describe('Auto-Margin Guard', () => {
  test('should simulate worst-case margin correctly', () => {
    const simulation = simulateWorstCaseMargin(
      10000, // ₾100 retail
      2000, // ₾20 cost
      500, // ₾5 shipping
      500, // 5% platform fee
      1000, // 10% affiliate
      200, // 2% refund reserve
      {
        maxRefundRatePct: 10,
        maxShippingDelayDays: 10,
        maxReturnShippingCostCents: 500,
        maxPlatformFeeincreaseBps: 500, // +5% fee
        competitorPriceCutPct: 10,
      }
    );

    expect(simulation.bestCaseMarginBps).toBeGreaterThan(simulation.worstCaseMarginBps);
    expect(simulation.scenarios.length).toBe(3);
    expect(simulation.avgCaseMarginBps).toBeLessThan(simulation.bestCaseMarginBps);
    expect(simulation.avgCaseMarginBps).toBeGreaterThan(simulation.worstCaseMarginBps);
  });

  test('should approve when worst-case margin acceptable', () => {
    const simulation = simulateWorstCaseMargin(
      10000,
      1000, // Low cost, high-margin product
      300,
      500,
      500,
      200,
      {
        maxRefundRatePct: 5,
        maxShippingDelayDays: 5,
        maxReturnShippingCostCents: 300,
        maxPlatformFeeincreaseBps: 300,
        competitorPriceCutPct: 5,
      }
    );

    expect(simulation.isApproved).toBe(true);
    expect(simulation.rejectionReason).toBeUndefined();
  });

  test('should reject when worst-case margin unacceptable', () => {
    const simulation = simulateWorstCaseMargin(
      5000, // Low retail price
      4000, // High cost relative to price
      500,
      500,
      1000,
      500,
      {
        maxRefundRatePct: 20,
        maxShippingDelayDays: 15,
        maxReturnShippingCostCents: 800,
        maxPlatformFeeincreaseBps: 1000,
        competitorPriceCutPct: 20,
      }
    );

    expect(simulation.isApproved).toBe(false);
    expect(simulation.rejectionReason).toBeTruthy();
  });

  test('should calculate minimum price for worst-case survival', () => {
    const minPrice = minPriceForWorstCase(
      2000,
      500,
      500,
      1000,
      200,
      {
        maxRefundRatePct: 10,
        maxShippingDelayDays: 10,
        maxReturnShippingCostCents: 500,
        maxPlatformFeeincreaseBps: 500,
        competitorPriceCutPct: 10,
      },
      700 // 7% minimum
    );

    expect(minPrice).toBeGreaterThan(2000);
    expect(minPrice % 50).toBe(0); // Rounded to nearest 50 cents
  });

  test('should provide margin sensitivity analysis', () => {
    const sensitivity = marginSensitivity(10000, 2000, 500, 500);

    // All factors should reduce margin (negative values)
    expect(sensitivity.refundRate5Pct).toBeLessThan(0);
    expect(sensitivity.shippingDelayPerDay).toBeLessThan(0);
    expect(sensitivity.competitorPrice10PctCut).toBeLessThan(0);
    expect(sensitivity.platformFeeIncrease5Pct).toBeLessThan(0);
  });
});

describe('Integration: Combined Revenue Optimization', () => {
  test('should flow: evaluate → price dynamically → monitor conversion → guard margins', () => {
    // 1. Initial evaluation
    const simulation = simulateWorstCaseMargin(
      10000,
      2000,
      500,
      500,
      1000,
      200,
      {
        maxRefundRatePct: 5,
        maxShippingDelayDays: 7,
        maxReturnShippingCostCents: 400,
        maxPlatformFeeincreaseBps: 300,
        competitorPriceCutPct: 5,
      }
    );

    expect(simulation.isApproved).toBe(true);

    // 2. Product launches, track conversion
    const conversionMetrics = {
      impressions: 1000,
      clicks: 80,
      cartAdds: 15,
      purchases: 4, // 0.4% conversion (low)
    };

    const analysis = analyzeConversionFunnel(conversionMetrics);
    expect(analysis.bottleneck).toBe('awareness');

    // 3. Dynamic pricing suggests adjustment
    const priceResult = computeDynamicPrice(
      10000,
      {
        currentMarginBps: 6000,
        targetMarginBps: 5000,
        conversionRate: 0.4,
        inventoryLevel: 50,
        maxInventory: 100,
        demandTrend: 'low',
        seasonality: 1.0,
      }
    );

    expect(priceResult.recommendedAction).toBe('decrease');

    // 4. New price still survives worst-case check
    const newSimulation = simulateWorstCaseMargin(
      priceResult.newPriceCents,
      2000,
      500,
      500,
      1000,
      200,
      {
        maxRefundRatePct: 5,
        maxShippingDelayDays: 7,
        maxReturnShippingCostCents: 400,
        maxPlatformFeeincreaseBps: 300,
        competitorPriceCutPct: 5,
      }
    );

    expect(newSimulation.isApproved).toBe(true);
  });
});
