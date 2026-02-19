/**
 * Seller Onboarding Types
 * 
 * Type definitions for seller onboarding automation system
 */

export type TaxStatus = "vat_payer" | "non_vat_payer";
export type BusinessType = "dropshipping" | "own_product" | "digital";
export type PricingMode = "growth" | "profit" | "hybrid";
export type OnboardingEventType =
  | "onboarding_started"
  | "tax_status_detected"
  | "pricing_mode_set"
  | "margin_configured"
  | "product_recommendation_generated"
  | "gtm_plan_generated"
  | "onboarding_completed"
  | "onboarding_failed";

export interface OnboardingProfile {
  userId: string;
  taxStatus: TaxStatus;
  businessType: BusinessType;
  targetMonthlyIncomeCents: number;
  availableBudgetCents: number;
  pricingMode: PricingMode;
  marginFloorBps: number;
  marginTargetBps: number;
  guardrailsEnabled: boolean;
}

export interface OnboardingEvent {
  userId: string;
  eventType: OnboardingEventType;
  status: "pending" | "completed" | "failed";
  metadataJson: Record<string, unknown>;
  createdAt: Date;
}

export interface PricingRecommendation {
  supplierCostCents: number;
  recommendedRetailPriceCents: number;
  expectedMarginBps: number;
  expectedNetProfitCents: number;
  vatApplicable: boolean;
  vatCents: number;
  platformFeeCents: number;
  breakEvenUnits: number;
  reasoning: string;
}

export interface GTMPlan {
  targetAudienceKa: string; // Georgian description
  channelRecommendations: string[];
  estimatedCacCents: number;
  estimatedLtvCents: number;
  ltvCacRatio: number;
  launchStrategies: string[];
  riskFactors: string[];
}

export interface OnboardingResult {
  success: boolean;
  profile: OnboardingProfile;
  pricingRecommendation: PricingRecommendation;
  gtmPlan: GTMPlan;
  events: OnboardingEvent[];
  errors?: string[];
}
