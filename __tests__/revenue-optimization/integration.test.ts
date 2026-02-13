/**
 * Integration Tests: Revenue Optimization Modules Working Together
 * 
 * These tests verify that all 5 modules integrate correctly with each other
 * and with the existing decision engine infrastructure
 */

import { computeDynamicPrice } from '@/lib/pricing/dynamicPricing';
import { analyzeConversionFunnel } from '@/lib/pricing/conversionOptimization';
import { computeShippingRiskScore, optimizeShippingStrategy } from '@/lib/shipping/shippingIntelligence';
import { simulateWorstCaseMargin, minPriceForWorstCase } from '@/lib/pricing/autoMarginGuard';

describe('Revenue Optimization Integration Suite', () => {
  describe('Scenario 1: New Product Launch Decision Flow', () => {
    test('should validate product survivability through all gatekeepers', () => {
      // PHASE 1: Worst-case margin simulation (first gatekeeper)
      const retailPrice = 10000; // ₾100
      const supplierCost = 2000; // ₾20
      const shippingCost = 500; // ₾5
      const platformFee = 500; // 5%
      const affiliateCommission = 1000; // 10%

      const worstCaseSimulation = simulateWorstCaseMargin(
        retailPrice,
        supplierCost,
        shippingCost,
        platformFee,
        affiliateCommission,
        200, // refund reserve
        {
          maxRefundRatePct: 10,
          maxShippingDelayDays: 14,
          maxReturnShippingCostCents: 600,
          maxPlatformFeeincreaseBps: 500,
          competitorPriceCutPct: 10,
        }
      );

      // Product should survive worst case
      expect(worstCaseSimulation.isApproved).toBe(true);
      expect(worstCaseSimulation.worstCaseMarginBps).toBeGreaterThan(700); // At least 7%
      expect(worstCaseSimulation.bestCaseMarginBps).toBeGreaterThan(worstCaseSimulation.worstCaseMarginBps);

      // PHASE 2: Shipping risk evaluation (second gatekeeper)
      const shippingRisk = computeShippingRiskScore({
        deliveryDaysAvg: 7,
        delayProbability: 0.05,
        refundRatePct: 5,
        carrierId: 'standard',
      });

      expect(shippingRisk.riskScore).toBeLessThan(50); // Manageable risk
      const adjustedMargin = worstCaseSimulation.worstCaseMarginBps - shippingRisk.recommendedMarginAdditionalBps;
      expect(adjustedMargin).toBeGreaterThan(500); // Still profitable after risk buffer

      // PHASE 3: Dynamic pricing optimization (profitability maximizer)
      const dynamicPrice = computeDynamicPrice(
        retailPrice,
        {
          currentMarginBps: worstCaseSimulation.avgCaseMarginBps,
          targetMarginBps: 2500, // 25% target
          conversionRate: 3.5,
          inventoryLevel: 50,
          maxInventory: 100,
          demandTrend: 'high',
          seasonality: 1.1,
        }
      );

      expect(dynamicPrice.recommendedAction).toBeDefined();
      // If margin is below target, should recommend increase
      if (worstCaseSimulation.avgCaseMarginBps < 2500) {
        expect(dynamicPrice.recommendedAction).toBe('increase');
        expect(dynamicPrice.newPriceCents).toBeGreaterThan(retailPrice);
      }

      // FINAL: Re-validate adjusted price survives worst case
      const adjustedSimulation = simulateWorstCaseMargin(
        dynamicPrice.newPriceCents,
        supplierCost,
        shippingCost,
        platformFee,
        affiliateCommission,
        200,
        {
          maxRefundRatePct: 10,
          maxShippingDelayDays: 14,
          maxReturnShippingCostCents: 600,
          maxPlatformFeeincreaseBps: 500,
          competitorPriceCutPct: 10,
        }
      );

      expect(adjustedSimulation.isApproved).toBe(true);
    });
  });

  describe('Scenario 2: Underperforming Product Optimization', () => {
    test('should diagnose low conversion and apply correction flow', () => {
      // Initial product performance
      const currentPrice = 8000;
      const initialMetrics = {
        impressions: 5000,
        clicks: 150,
        cartAdds: 20,
        purchases: 5, // 0.1% conversion (very low)
      };

      // PHASE 1: Diagnose bottleneck
      const analysis = analyzeConversionFunnel(initialMetrics);

      expect(analysis.conversionRate).toBeLessThan(1);
      expect(analysis.bottleneck).toBe('awareness'); // CTR is only 3%

      // PHASE 2: Get specific suggestions
      expect(analysis.suggestions).toHaveLength(3);
      expect(analysis.suggestions[0].priority).toBe('high');
      const topSuggestion = analysis.suggestions[0];

      // PHASE 3: Apply price adjustment to test demand
      const priceTest = computeDynamicPrice(
        currentPrice,
        {
          currentMarginBps: 3000,
          targetMarginBps: 2500,
          conversionRate: 0.1,
          inventoryLevel: 20,
          maxInventory: 100,
          demandTrend: 'low',
          seasonality: 1.0,
        }
      );

      // With very low conversion, should try price decrease
      expect(priceTest.recommendedAction).toBe('decrease');

      // PHASE 4: Verify price adjustment doesn't violate margin floor
      const margins = simulateWorstCaseMargin(
        priceTest.newPriceCents,
        2000,
        500,
        500,
        800,
        100,
        {
          maxRefundRatePct: 8,
          maxShippingDelayDays: 10,
          maxReturnShippingCostCents: 500,
          maxPlatformFeeincreaseBps: 300,
          competitorPriceCutPct: 8,
        }
      );

      // Even at lowered price, should still be approved
      expect(margins.isApproved).toBe(true);
    });
  });

  describe('Scenario 3: High-Margin Premium Product Strategy', () => {
    test('should maximize revenue for premium tier offerings', () => {
      const premiumPrice = 30000; // ₾300
      const premiumCost = 5000; // ₾50
      const premiumShipping = 1000; // ₾10

      // PHASE 1: Verify premium can sustain worst case
      const premiumMargins = simulateWorstCaseMargin(
        premiumPrice,
        premiumCost,
        premiumShipping,
        1000, // 10% platform fee for high-price items
        2000, // 20% affiliate for premium
        500,
        {
          maxRefundRatePct: 3, // Lower refund rate for premium
          maxShippingDelayDays: 10,
          maxReturnShippingCostCents: 800,
          maxPlatformFeeincreaseBps: 300,
          competitorPriceCutPct: 5,
        }
      );

      expect(premiumMargins.isApproved).toBe(true);
      expect(premiumMargins.worstCaseMarginBps).toBeGreaterThan(7000); // At least 70%

      // PHASE 2: Optimize pricing for high demand
      const optimized = computeDynamicPrice(
        premiumPrice,
        {
          currentMarginBps: premiumMargins.avgCaseMarginBps,
          targetMarginBps: 8000, // 80% target for premium
          conversionRate: 0.5, // Lower conversion expected
          inventoryLevel: 10, // Limited inventory
          maxInventory: 100,
          demandTrend: 'high',
          seasonality: 1.2,
        }
      );

      // Premium product may justify price increase
      expect(optimized.expectedMarginBps).toBeGreaterThan(premiumMargins.avgCaseMarginBps);

      // PHASE 3: Shipping optimization for premium (speed matters)
      const shippingStrat = optimizeShippingStrategy('standard', 8000, 2); // 2-day delivery target
      expect(shippingStrat.estimatedShippingCostCents).toBeGreaterThan(premiumShipping);
      expect(shippingStrat.estimatedRiskScore).toBeLessThan(20); // Premium + fast shipping = low risk
    });
  });

  describe('Scenario 4: Risk Mitigation for Volatile Markets', () => {
    test('should add safety buffers for high-uncertainty products', () => {
      const volatilePrice = 5000;
      const volatileCost = 2000;

      // High uncertainty scenario
      const volatileMargins = simulateWorstCaseMargin(
        volatilePrice,
        volatileCost,
        600,
        300,
        500,
        100,
        {
          maxRefundRatePct: 20, // High refund risk
          maxShippingDelayDays: 21, // Long delays possible
          maxReturnShippingCostCents: 800,
          maxPlatformFeeincreaseBps: 1000, // Potential fee increases
          competitorPriceCutPct: 20, // Price war scenario
        }
      );

      // Should still approve but with tight margins
      if (volatileMargins.isApproved) {
        expect(volatileMargins.worstCaseMarginBps).toBeLessThan(volatileMargins.avgCaseMarginBps);

        // Recommendation: increase price for safety
        const saferPrice = minPriceForWorstCase(
          volatileCost,
          600,
          300,
          500,
          100,
          {
            maxRefundRatePct: 20,
            maxShippingDelayDays: 21,
            maxReturnShippingCostCents: 800,
            maxPlatformFeeincreaseBps: 1000,
            competitorPriceCutPct: 20,
          },
          1500 // 15% safety floor
        );

        expect(saferPrice).toBeGreaterThan(volatilePrice);
        
        // Re-validate at safer price
        const saferMargins = simulateWorstCaseMargin(
          saferPrice,
          volatileCost,
          600,
          300,
          500,
          100,
          {
            maxRefundRatePct: 20,
            maxShippingDelayDays: 21,
            maxReturnShippingCostCents: 800,
            maxPlatformFeeincreaseBps: 1000,
            competitorPriceCutPct: 20,
          }
        );

        expect(saferMargins.worstCaseMarginBps).toBeGreaterThan(1500 * 100); // At least 15%
      }
    });
  });

  describe('Scenario 5: Multi-Product Portfolio Optimization', () => {
    test('should optimize portfolio with mixed margin profiles', () => {
      const portfolio = [
        {
          name: 'Budget Product',
          price: 3000,
          cost: 1500,
          targetMargin: 1500, // 50% (budget tier)
        },
        {
          name: 'Mid-Tier Product',
          price: 8000,
          cost: 2000,
          targetMargin: 2500, // 25% (standard)
        },
        {
          name: 'Premium Product',
          price: 25000,
          cost: 4000,
          targetMargin: 5000, // 50% (premium)
        },
      ];

      const optimizedPrices: Record<string, { recommended: number; approved: boolean }> = {};

      for (const product of portfolio) {
        // Verify worst case
        const margins = simulateWorstCaseMargin(
          product.price,
          product.cost,
          500,
          300,
          1000,
          100,
          {
            maxRefundRatePct: 5,
            maxShippingDelayDays: 7,
            maxReturnShippingCostCents: 500,
            maxPlatformFeeincreaseBps: 300,
            competitorPriceCutPct: 5,
          }
        );

        // Optimize price
        const optimized = computeDynamicPrice(
          product.price,
          {
            currentMarginBps: margins.avgCaseMarginBps,
            targetMarginBps: product.targetMargin,
            conversionRate: 2.5,
            inventoryLevel: 40,
            maxInventory: 100,
            demandTrend: 'medium',
            seasonality: 1.0,
          }
        );

        optimizedPrices[product.name] = {
          recommended: optimized.newPriceCents,
          approved: margins.isApproved,
        };

        expect(margins.isApproved).toBe(true);
      }

      // All products should be approved and optimized
      expect(Object.keys(optimizedPrices)).toHaveLength(3);
      Object.values(optimizedPrices).forEach((p) => {
        expect(p.approved).toBe(true);
      });
    });
  });
});
