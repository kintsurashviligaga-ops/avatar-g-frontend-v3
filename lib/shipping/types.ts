/**
 * Shipping Intelligence Types
 * Risk assessment and carrier reliability scoring
 */

export interface ShippingRiskFactors {
  routeRisk: 'low' | 'medium' | 'high';
  carrierRisk: 'low' | 'medium' | 'high';
  weatherRisk: 'low' | 'medium' | 'high';
  distanceKm: number;
  estimatedDelayDays: number;
  lossRateBps: number; // Basis points (e.g., 50 = 0.5% loss rate)
}

export interface ShippingRiskScore {
  overallScore: number; // 0-100 (higher = safer)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: ShippingRiskFactors;
  recommendation: string;
  insuranceSuggested: boolean;
}

export interface CarrierReliability {
  carrierId: string;
  carrierName: string;
 onTimePercent: number;
  lossRateBps: number;
  avgDelayDays: number;
  customerSatisfactionScore: number; // 0-100
}
