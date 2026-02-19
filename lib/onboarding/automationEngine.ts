/**
 * Seller Onboarding Automation Engine
 * 
 * Automates the complete seller onboarding flow:
 * 1. Tax status detection
 * 2. VAT/Income mode configuration
 * 3. Margin floor (20%) + target (30%) setup
 * 4. Dynamic pricing enablement
 * 5. First product pricing recommendation
 * 6. GTM plan generation
 * 7. Event logging
 */

import type {
  OnboardingProfile,
  OnboardingEvent,
  OnboardingResult,
  PricingRecommendation,
  GTMPlan,
  TaxStatus,
  BusinessType,
  PricingMode,
} from "./types";

const GEORGIA_VAT_BPS = 1800; // 18%
const DEFAULT_MARGIN_FLOOR_BPS = 2000; // 20%
const DEFAULT_MARGIN_TARGET_BPS = 3000; // 30%
const DEFAULT_PLATFORM_FEE_BPS = 500; // 5%

/**
 * Main onboarding automation function
 */
export async function runOnboardingAutomation(
  userId: string,
  taxStatus: TaxStatus,
  businessType: BusinessType,
  targetMonthlyIncomeCents: number,
  availableBudgetCents: number
): Promise<OnboardingResult> {
  const events: OnboardingEvent[] = [];
  const errors: string[] = [];

  try {
    // Step 1: Log onboarding start
    logEvent(events, userId, "onboarding_started", "completed", {
      taxStatus,
      businessType,
      targetMonthlyIncomeCents,
      availableBudgetCents,
    });

    // Step 2: Detect tax status and configure VAT
    const vatBps = taxStatus === "vat_payer" ? GEORGIA_VAT_BPS : 0;
    logEvent(events, userId, "tax_status_detected", "completed", {
      taxStatus,
      vatBps,
      vatPercent: vatBps / 100,
    });

    // Step 3: Recommend pricing mode based on business type
    const pricingMode = recommendPricingMode(businessType, targetMonthlyIncomeCents, availableBudgetCents);
    logEvent(events, userId, "pricing_mode_set", "completed", {
      pricingMode,
      reasoning: getPricingModeReasoning(pricingMode, businessType),
    });

    // Step 4: Configure margin floor and target
    const marginFloorBps = DEFAULT_MARGIN_FLOOR_BPS;
    const marginTargetBps = DEFAULT_MARGIN_TARGET_BPS;
    logEvent(events, userId, "margin_configured", "completed", {
      marginFloorBps,
      marginTargetBps,
      marginFloorPercent: marginFloorBps / 100,
      marginTargetPercent: marginTargetBps / 100,
    });

    // Step 5: Create onboarding profile
    const profile: OnboardingProfile = {
      userId,
      taxStatus,
      businessType,
      targetMonthlyIncomeCents,
      availableBudgetCents,
      pricingMode,
      marginFloorBps,
      marginTargetBps,
      guardrailsEnabled: true,
    };

    // Step 6: Generate first product pricing recommendation
    const pricingRecommendation = generatePricingRecommendation(
      profile,
      vatBps,
      DEFAULT_PLATFORM_FEE_BPS
    );
    logEvent(events, userId, "product_recommendation_generated", "completed", {
      recommendedRetailPriceCents: pricingRecommendation.recommendedRetailPriceCents,
      expectedMarginBps: pricingRecommendation.expectedMarginBps,
      breakEvenUnits: pricingRecommendation.breakEvenUnits,
    });

    // Step 7: Generate GTM plan
    const gtmPlan = generateGTMPlan(profile, businessType);
    logEvent(events, userId, "gtm_plan_generated", "completed", {
      channels: gtmPlan.channelRecommendations,
      estimatedCacCents: gtmPlan.estimatedCacCents,
      estimatedLtvCents: gtmPlan.estimatedLtvCents,
      ltvCacRatio: gtmPlan.ltvCacRatio,
    });

    // Step 8: Mark onboarding as complete
    logEvent(events, userId, "onboarding_completed", "completed", {
      profileId: profile.userId,
      totalSteps: events.length,
    });

    return {
      success: true,
      profile,
      pricingRecommendation,
      gtmPlan,
      events,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    errors.push(errorMessage);
    
    logEvent(events, userId, "onboarding_failed", "failed", {
      error: errorMessage,
    });

    // Return partial result
    return {
      success: false,
      profile: {
        userId,
        taxStatus,
        businessType,
        targetMonthlyIncomeCents,
        availableBudgetCents,
        pricingMode: "hybrid",
        marginFloorBps: DEFAULT_MARGIN_FLOOR_BPS,
        marginTargetBps: DEFAULT_MARGIN_TARGET_BPS,
        guardrailsEnabled: true,
      },
      pricingRecommendation: {} as PricingRecommendation,
      gtmPlan: {} as GTMPlan,
      events,
      errors,
    };
  }
}

export const runSellerOnboarding = runOnboardingAutomation;

/**
 * Recommend pricing mode based on business profile
 */
function recommendPricingMode(
  businessType: BusinessType,
  targetIncomeCents: number,
  budgetCents: number
): PricingMode {
  // Digital products → Profit mode (low costs, maximize margin)
  if (businessType === "digital") {
    return "profit";
  }

  // Low budget + high target → Growth mode (capture market share)
  const budgetToTargetRatio = budgetCents / targetIncomeCents;
  if (budgetToTargetRatio < 0.5) {
    return "growth";
  }

  // Dropshipping → Hybrid (balance growth and profit)
  if (businessType === "dropshipping") {
    return "hybrid";
  }

  // Own product → Profit mode (higher margins possible)
  return "profit";
}

/**
 * Generate pricing recommendation for first product
 */
function generatePricingRecommendation(
  profile: OnboardingProfile,
  vatBps: number,
  platformFeeBps: number
): PricingRecommendation {
  // Estimate supplier cost based on available budget
  // Assume seller can afford 5-10 units with their budget
  const targetUnits = 7;
  const supplierCostCents = Math.round(profile.availableBudgetCents / targetUnits);
  
  // Add shipping estimate (15% of supplier cost for dropshipping, 10% for own)
  const shippingPercent = profile.businessType === "dropshipping" ? 0.15 : 0.10;
  const shippingCostCents = Math.round(supplierCostCents * shippingPercent);
  
  const totalCostCents = supplierCostCents + shippingCostCents;

  // Calculate retail price to hit target margin
  const targetMarginBps = profile.marginTargetBps;
  
  // Formula: retailPrice = cost / (1 - margin - platformFee - vat)
  const totalDeductionBps = targetMarginBps + platformFeeBps + vatBps;
  const retailPriceCents = Math.round((totalCostCents * 10000) / (10000 - totalDeductionBps));

  // Calculate actual components
  const platformFeeCents = Math.round((retailPriceCents * platformFeeBps) / 10000);
  const vatCents = Math.round((retailPriceCents * vatBps) / 10000);
  const netProfitCents = retailPriceCents - totalCostCents - platformFeeCents - vatCents;
  const actualMarginBps = Math.round((netProfitCents * 10000) / retailPriceCents);

  // Break-even calculation (assume 50 GEL fixed costs)
  const fixedCostsCents = 5000;
  const breakEvenUnits = Math.ceil(fixedCostsCents / (netProfitCents || 1));

  // Generate reasoning in Georgian
  const reasoning = profile.businessType === "digital"
    ? "ციფრული პროდუქტისთვის შეგიძლია დააწესო მაღალი ფასი, რაც უზრუნველყოფს 30%+ მარჟას."
    : profile.businessType === "dropshipping"
    ? "Dropshipping-ისთვის რეკომენდებულია ბალანსირებული ფასი - არც მეტისმეტად მაღალი, არც დაბალი."
    : "საკუთარი პროდუქტით შეგიძლია კონტროლი მოიპოვო ღირებულებაზე და მიაღწიო მაღალ მარჟას.";

  return {
    supplierCostCents: totalCostCents,
    recommendedRetailPriceCents: retailPriceCents,
    expectedMarginBps: actualMarginBps,
    expectedNetProfitCents: netProfitCents,
    vatApplicable: vatBps > 0,
    vatCents,
    platformFeeCents,
    breakEvenUnits,
    reasoning,
  };
}

/**
 * Generate GTM (Go-To-Market) plan
 */
function generateGTMPlan(profile: OnboardingProfile, businessType: BusinessType): GTMPlan {
  // Georgian target audience description
  const targetAudienceKa = businessType === "digital"
    ? "ახალგაზრდა პროფესიონალები (25-40 წელი), რომლებიც აფასებენ დროს და ხარისხს"
    : businessType === "dropshipping"
    ? "ონლაინ მყიდველები (18-45 წელი), რომლებიც ეძებენ საერთაშორისო პროდუქტებს ადგილობრივ ბაზარზე"
    : "ლოკალური მყიდველები, რომლებიც ანიჭებენ პრიორიტეტს ქართულ ბრენდებს";

  // Channel recommendations
  const channelRecommendations = businessType === "digital"
    ? ["TikTok", "Instagram", "Facebook Groups", "LinkedIn", "Email Marketing"]
    : ["TikTok", "Instagram", "Facebook Marketplace", "Local Influencers"];

  // CAC estimation (Customer Acquisition Cost)
  // Digital: Lower CAC (viral potential)
  // Dropshipping: Medium CAC
  // Own product: Higher CAC (needs brand building)
  const estimatedCacCents = businessType === "digital" ? 500 : // 5 GEL
    businessType === "dropshipping" ? 1000 : // 10 GEL
    1500; // 15 GEL

  // LTV estimation (Lifetime Value)
  // Assume 3-5 repeat purchases over 12 months
  const repeatPurchases = businessType === "digital" ? 5 : 3;
  const avgOrderValueCents = profile.targetMonthlyIncomeCents / 20; // 20 orders per month target
  const estimatedLtvCents = avgOrderValueCents * repeatPurchases;

  const ltvCacRatio = estimatedLtvCents / estimatedCacCents;

  // Launch strategies
  const launchStrategies = [
    "პირველი 10 მყიდველისთვის 15% ფასდაკლება",
    "TikTok ვიდეო კამპანია პირველ კვირაში",
    "Instagram Reels-ით პროდუქტის დემონსტრაცია",
    "რეფერალური პროგრამა - მოიწვიე მეგობარი, მიიღე 10₾ ბონუსი",
  ];

  // Risk factors
  const riskFactors = [
    businessType === "dropshipping" && "მიწოდების დრო 10-15 დღე (საერთაშორისო)",
    profile.taxStatus === "non_vat_payer" && "არ ხარ დღგ გადამხდელი - შეზღუდული პოტენციალი 100,000₾+",
    "კონკურენცია TikTok/Instagram-ზე",
    ltvCacRatio < 2 && "LTV/CAC თანაფარდობა დაბალია - გაზარდე მარკეტინგის ეფექტურობა",
  ].filter(Boolean) as string[];

  return {
    targetAudienceKa,
    channelRecommendations,
    estimatedCacCents,
    estimatedLtvCents,
    ltvCacRatio: Math.round(ltvCacRatio * 100) / 100, // 2 decimal places
    launchStrategies,
    riskFactors,
  };
}

/**
 * Helper: Get pricing mode reasoning
 */
function getPricingModeReasoning(mode: PricingMode, _businessType: BusinessType): string {
  if (mode === "growth") {
    return "ზრდის რეჟიმი - ბაზრის წილის მოპოვება დაბალი ფასებით";
  }
  if (mode === "profit") {
    return "მოგების რეჟიმი - მაღალი მარჟით მაქსიმალური შემოსავალი";
  }
  return "ჰიბრიდული რეჟიმი - ბალანსი ზრდასა და მოგებას შორის";
}

/**
 * Helper: Log onboarding event
 */
function logEvent(
  events: OnboardingEvent[],
  userId: string,
  eventType: OnboardingEvent["eventType"],
  status: OnboardingEvent["status"],
  metadata: Record<string, unknown>
): void {
  events.push({
    userId,
    eventType,
    status,
    metadataJson: metadata,
    createdAt: new Date(),
  });
}
