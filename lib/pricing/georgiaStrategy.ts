/**
 * Georgia Pricing Strategy Engine
 * 
 * Implements intelligent pricing modes for Georgian market:
 * - GROWTH: Maximize market share with competitive pricing
 * - PROFIT: Maximize margins with premium pricing
 * - HYBRID: Balance growth and profit based on LTV/CAC
 * 
 * All calculations use integer cents (no floats).
 */

export enum PricingMode {
  GROWTH = "growth",
  PROFIT = "profit",
  HYBRID = "hybrid",
}

export interface PricingParameters {
  supplierCostCents: number;
  shippingCostCents: number;
  platformFeeBps: number; // Basis points (e.g., 500 = 5%)
  vatBps: number; // 1800 for 18% VAT in Georgia
  targetMarginBps: number; // Desired margin in basis points
}

export interface PricingResult {
  retailPriceCents: number;
  platformFeeCents: number;
  vatCents: number;
  netProfitCents: number;
  actualMarginBps: number;
  mode: PricingMode;
  reasoning: string;
}

/**
 * Recommend pricing mode based on LTV/CAC ratio
 */
export function recommendPricingMode(ltv: number, cac: number): PricingMode {
  const ratio = ltv / cac;

  // Poor unit economics → Focus on growth to improve efficiency
  if (ratio < 1.5) {
    return PricingMode.GROWTH;
  }

  // Excellent unit economics → Maximize profit
  if (ratio > 2.5) {
    return PricingMode.PROFIT;
  }

  // Good unit economics → Balance growth and profit
  return PricingMode.HYBRID;
}

/**
 * Calculate retail price based on pricing mode
 */
export function calculateRetailPrice(
  params: PricingParameters,
  mode: PricingMode
): PricingResult {
  const { supplierCostCents, shippingCostCents, platformFeeBps, vatBps } = params;
  
  const totalCostCents = supplierCostCents + shippingCostCents;

  // Adjust target margin based on mode
  let targetMarginBps = params.targetMarginBps;

  switch (mode) {
    case PricingMode.GROWTH:
      // Growth mode: Lower margin (20-25%) for competitive pricing
      targetMarginBps = Math.max(2000, targetMarginBps - 500); // Min 20%
      break;
    
    case PricingMode.PROFIT:
      // Profit mode: Higher margin (30-40%) for premium pricing
      targetMarginBps = Math.min(4000, targetMarginBps + 1000); // Max 40%
      break;
    
    case PricingMode.HYBRID:
      // Hybrid mode: Use provided target margin (typically 25-30%)
      break;
  }

  // Calculate retail price using formula:
  // retailPrice = cost / (1 - margin - platformFee - vat)
  const totalDeductionBps = targetMarginBps + platformFeeBps + vatBps;
  const retailPriceCents = Math.round((totalCostCents * 10000) / (10000 - totalDeductionBps));

  // Calculate actual components
  const platformFeeCents = Math.round((retailPriceCents * platformFeeBps) / 10000);
  const vatCents = Math.round((retailPriceCents * vatBps) / 10000);
  const netProfitCents = retailPriceCents - totalCostCents - platformFeeCents - vatCents;

  // Calculate actual margin achieved
  const actualMarginBps = Math.round((netProfitCents * 10000) / retailPriceCents);

  // Generate reasoning
  const reasoning = getPricingReasoning(mode, actualMarginBps);

  return {
    retailPriceCents,
    platformFeeCents,
    vatCents,
    netProfitCents,
    actualMarginBps,
    mode,
    reasoning,
  };
}

/**
 * Calculate platform fee percentage based on pricing mode
 * Standard: 5%, Premium (profit mode): 7%, Growth support: 3%
 */
export function calculateGeorgianPlatformFee(
  mode: PricingMode,
  tierLevel: "standard" | "premium" | "enterprise" = "standard"
): number {
  // Base fees in basis points
  const baseFees = {
    standard: 500, // 5%
    premium: 700, // 7%
    enterprise: 400, // 4%
  };

  let feeBps = baseFees[tierLevel];

  // Discount for growth mode to support market penetration
  if (mode === PricingMode.GROWTH && tierLevel === "standard") {
    feeBps = 300; // 3% to support growth sellers
  }

  return feeBps;
}

/**
 * Generate Georgian-localized pricing reasoning
 */
function getPricingReasoning(mode: PricingMode, marginBps: number): string {
  const marginPercent = (marginBps / 100).toFixed(1);

  switch (mode) {
    case PricingMode.GROWTH:
      return `ზრდის რეჟიმი: კონკურენტული ფასი ${marginPercent}% მარჟით ბაზრის წილის მოსაპოვებლად.`;
    
    case PricingMode.PROFIT:
      return `მოგების რეჟიმი: პრემიუმ ფასი ${marginPercent}% მარჟით მაქსიმალური შემოსავლისთვის.`;
    
    case PricingMode.HYBRID:
      return `ჰიბრიდული რეჟიმი: ბალანსირებული ფასი ${marginPercent}% მარჟით ზრდისა და მოგების ოპტიმიზაციისთვის.`;
    
    default:
      return `${marginPercent}% მარჟა`;
  }
}

/**
 * Dynamic pricing adjustment based on market conditions
 */
export interface MarketConditions {
  competitorPriceCents: number;
  demandLevel: "low" | "medium" | "high";
  seasonalFactor: number; // 0.8 (low season) to 1.2 (high season)
  inventoryLevel: "low" | "medium" | "high";
}

export function adjustPriceForMarket(
  basePriceCents: number,
  conditions: MarketConditions,
  mode: PricingMode
): number {
  let adjustedPrice = basePriceCents;

  // Competitor pricing influence (stronger in growth mode)
  if (mode === PricingMode.GROWTH) {
    // Stay competitive - aim for 5-10% below competitor
    const targetPrice = Math.round(conditions.competitorPriceCents * 0.92);
    adjustedPrice = Math.min(adjustedPrice, targetPrice);
  }

  // Demand-based adjustment
  const demandMultipliers = {
    low: 0.95, // 5% discount during low demand
    medium: 1.0,
    high: 1.05, // 5% premium during high demand
  };
  adjustedPrice = Math.round(adjustedPrice * demandMultipliers[conditions.demandLevel]);

  // Seasonal adjustment
  adjustedPrice = Math.round(adjustedPrice * conditions.seasonalFactor);

  // Inventory-based adjustment (urgent clearance)
  if (conditions.inventoryLevel === "high" && mode !== PricingMode.PROFIT) {
    adjustedPrice = Math.round(adjustedPrice * 0.90); // 10% discount for clearance
  }

  return adjustedPrice;
}

/**
 * Validate pricing against margin floor
 */
export function validateMinimumMargin(
  retailPriceCents: number,
  costCents: number,
  platformFeeCents: number,
  vatCents: number,
  minMarginBps: number = 2000 // 20% default floor
): { isValid: boolean; actualMarginBps: number; message: string } {
  const netProfitCents = retailPriceCents - costCents - platformFeeCents - vatCents;
  const actualMarginBps = Math.round((netProfitCents * 10000) / retailPriceCents);

  const isValid = actualMarginBps >= minMarginBps;
  const marginPercent = (actualMarginBps / 100).toFixed(1);
  const floorPercent = (minMarginBps / 100).toFixed(1);

  const message = isValid
    ? `✓ მარჟა ${marginPercent}% - დაცულია ${floorPercent}%-ზე მაღალი`
    : `✗ მარჟა ${marginPercent}% - ნაკლებია ${floorPercent}%-ზე. გაზარდე ფასი ან შეამცირე ხარჯები.`;

  return { isValid, actualMarginBps, message };
}
