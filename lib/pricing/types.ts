/**
 * Dynamic Pricing & Revenue Optimization Types
 */

// Dynamic Pricing
export interface PricingSignals {
  currentMarginBps: number;
  targetMarginBps: number;
  conversionRate: number; // 0-100 (e.g., 5 = 5%)
  inventoryLevel: number; // units available
  maxInventory: number; // capacity
  competitorPriceCents?: number;
  demandTrend: 'high' | 'medium' | 'low';
  seasonality: number; // 0.8 (winter) to 1.2 (peak)
}

export interface DynamicPriceResult {
  newPriceCents: number;
  reason: string; // Why price changed
  expectedMarginBps: number;
  confidence: number; // 0-100%
  recommendedAction: 'increase' | 'decrease' | 'maintain';
}

// Conversion Optimization
export interface ConversionMetrics {
  impressions: number;
  clicks: number;
  cartAdds: number;
  purchases: number;
}

export interface ConversionAnalysis {
  conversionRate: number; // purchases / impressions * 100
  clickToCartRate: number; // cartAdds / clicks * 100
  cartToOrderRate: number; // purchases / cartAdds * 100
  suggestions: ConversionSuggestion[];
  bottleneck: 'awareness' | 'interest' | 'decision';
}

export interface ConversionSuggestion {
  type: 'title' | 'images' | 'price' | 'affiliate' | 'description';
  priority: 'high' | 'medium' | 'low';
  expectedImpact: number; // % improvement
  action: string;
}

// Market Scanning
export interface MarketScanRequest {
  niche: string;
  country: string;
  priceRangeCents: [number, number]; // [min, max] cents
  competitorUrl?: string;
}

export interface ScannedProduct {
  id: string;
  name: string;
  currentPriceCents: number;
  estimatedCostCents: number;
  profitMarginBps: number;
  estimatedDemand: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
  riskScore: number; // 0-100 (0=safe, 100=risky)
  decisionEngineApproval: 'approved' | 'rejected';
  rejectionReason?: string;
  recommendedPriceCents?: number;
}

// Shipping Intelligence
export interface ShippingRiskFactors {
  deliveryDaysAvg: number;
  delayProbability: number; // 0-1
  refundRatePct: number; // 0-100
  carrierId: string;
}

export interface ShippingRiskScore {
  riskScore: number; // 0-100 (0=safe, 100=risky)
  conversionImpact: number; // % expected reduction
  recommendedMarginAdditionalBps: number; // extra margin needed
  recommendation: string;
}

// Auto-Margin Guard
export interface MarginSimulation {
  bestCaseMarginBps: number;
  worstCaseMarginBps: number;
  avgCaseMarginBps: number;
  scenarios: MarginScenario[];
  isApproved: boolean;
  rejectionReason?: string;
}

export interface MarginScenario {
  name: string;
  probability: number; // 0-1
  marginBps: number;
  assumptions: Record<string, string | number>;
}

// AI Product Recommendation
export interface ProductRecommendation {
  productId: string;
  rank: number;
  scoringFactors: {
    profitabilityScore: number; // 0-100
    demandScore: number; // 0-100
    competitionScore: number; // 0-100 (lower is better)
    overallScore: number; // 0-100
  };
}
