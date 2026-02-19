import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

// ========================================
// PROFIT FIRST GUARDRAILS
// ========================================

export type StoreGoal = 'profit' | 'volume' | 'hybrid';

export interface ProfitFirstConfig {
  storeId: string;
  goal: StoreGoal;
  platformFeeBps: number; // Basis points (500 = 5%)
  refundReserveBps: number;
  minMarginBps: number;
}

export interface ProfitFirstRecommendation {
  goal: StoreGoal;
  platformFeeBps: number;
  refundReserveBps: number;
  minMarginBps: number;
  rationale: string;
}

/**
 * Get profit first recommendations based on goal
 */
export function getProfitFirstRecommendations(goal: StoreGoal): ProfitFirstRecommendation {
  const configs: Record<StoreGoal, ProfitFirstRecommendation> = {
    profit: {
      goal: 'profit',
      platformFeeBps: 300, // 3% lower fees for profit-focused
      refundReserveBps: 500, // 5% safety reserve
      minMarginBps: 1500, // 15% minimum margin enforced
      rationale:
        'Profit-first stores maintain higher margins and lower risk. Platform fees reduced to encourage high-value sales.',
    },
    volume: {
      goal: 'volume',
      platformFeeBps: 750, // 7.5% higher fees for volume
      refundReserveBps: 300, // 3% lower reserve (lower risk per unit)
      minMarginBps: 200, // 2% minimum (allow aggressive pricing)
      rationale:
        'Volume-focused stores compete on price. Lower margin threshold allows competitive pricing while maintaining safety.',
    },
    hybrid: {
      goal: 'hybrid',
      platformFeeBps: 500, // 5% balanced fee
      refundReserveBps: 400, // 4% balanced reserve
      minMarginBps: 700, // 7% balanced margin
      rationale:
        'Hybrid approach balances profitability and market competitiveness. Recommended for most stores.',
    },
  };

  return configs[goal];
}

/**
 * Create or update profit first config for a store
 */
export async function setupProfitFirstConfig(
  storeId: string,
  goal: StoreGoal,
  supabaseClient?: SupabaseClient
): Promise<ProfitFirstConfig | null> {
  const client = supabaseClient || createSupabaseServerClient();
  const recommendations = getProfitFirstRecommendations(goal);

  try {
    const { data, error } = await client
      .from('profit_first_config')
      .upsert([
        {
          store_id: storeId,
          goal: recommendations.goal,
          platform_fee_bps: recommendations.platformFeeBps,
          refund_reserve_bps: recommendations.refundReserveBps,
          min_margin_bps: recommendations.minMarginBps,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Error setting up Profit First config:', error);
      return null;
    }

    return {
      storeId: data.store_id,
      goal: data.goal,
      platformFeeBps: data.platform_fee_bps,
      refundReserveBps: data.refund_reserve_bps,
      minMarginBps: data.min_margin_bps,
    };
  } catch (error) {
    console.error('Error setting up Profit First config:', error);
    return null;
  }
}

/**
 * Get Profit First config for a store
 */
export async function getProfitFirstConfig(
  storeId: string,
  supabaseClient?: SupabaseClient
): Promise<ProfitFirstConfig | null> {
  const client = supabaseClient || createSupabaseServerClient();

  try {
    const { data, error } = await client
      .from('profit_first_config')
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (error) {
      console.error('Error fetching Profit First config:', error);
      return null;
    }

    return {
      storeId: data.store_id,
      goal: data.goal,
      platformFeeBps: data.platform_fee_bps,
      refundReserveBps: data.refund_reserve_bps,
      minMarginBps: data.min_margin_bps,
    };
  } catch (error) {
    console.error('Error fetching Profit First config:', error);
    return null;
  }
}

/**
 * Check if product margin meets profit first requirements
 */
export function checkProfitMarginCompliance(
  productCostCents: number,
  sellingPriceCents: number,
  minMarginBps: number
): {
  compliant: boolean;
  marginBps: number;
  minimumPriceCents: number;
  warning?: string;
} {
  if (sellingPriceCents <= productCostCents) {
    return {
      compliant: false,
      marginBps: 0,
      minimumPriceCents: Math.ceil(productCostCents * (1 + minMarginBps / 10000)),
      warning: 'Negative margin - selling below cost',
    };
  }

  const profitCents = sellingPriceCents - productCostCents;
  const marginBps = Math.floor((profitCents * 10000) / sellingPriceCents);

  const minimumPriceCents = Math.ceil(productCostCents * (1 + minMarginBps / 10000));
  const compliant = sellingPriceCents >= minimumPriceCents;

  return {
    compliant,
    marginBps,
    minimumPriceCents,
    warning: !compliant
      ? `Margin ${(marginBps / 100).toFixed(1)}% below minimum ${(minMarginBps / 100).toFixed(1)}%`
      : undefined,
  };
}

/**
 * Get recommended price based on cost and margin requirement
 */
export function getRecommendedPrice(
  productCostCents: number,
  minMarginBps: number,
  platformFeeBps: number
): number {
  // Calculate price to maintain margin after platform fee
  // Final profit = (price - cost - (price * feeBps / 10000)) > price * (minMarginBps / 10000)
  // Rearranging: price = cost / (1 - (minMarginBps + platformFeeBps) / 10000)

  const totalFeeBps = platformFeeBps + minMarginBps;
  const recommendedPrice = Math.ceil(productCostCents / (1 - totalFeeBps / 10000));

  return recommendedPrice;
}

/**
 * Calculate profit forecast
 */
export function calculateProfitForecast(args: {
  estimatedMonthlyRevenueCents: number;
  productCostBps: number; // Cost as % of revenue
  platformFeeBps: number;
  refundReserveBps: number;
  operatingCostsCents?: number; // Fixed monthly costs
}): {
  grossRevenue: number;
  platformFees: number;
  productCosts: number;
  refundReserve: number;
  operatingCosts: number;
  netProfit: number;
  profitMarginBps: number;
} {
  const { estimatedMonthlyRevenueCents: revenue, productCostBps, platformFeeBps, refundReserveBps, operatingCostsCents } = args;

  const platformFees = Math.floor((revenue * platformFeeBps) / 10000);
  const productCosts = Math.floor((revenue * productCostBps) / 10000);
  const refundReserve = Math.floor((revenue * refundReserveBps) / 10000);
  const operatingCosts = operatingCostsCents || 0;

  const netProfit = revenue - platformFees - productCosts - refundReserve - operatingCosts;
  const profitMarginBps = Math.floor((netProfit * 10000) / revenue);

  return {
    grossRevenue: revenue,
    platformFees,
    productCosts,
    refundReserve,
    operatingCosts,
    netProfit,
    profitMarginBps,
  };
}

// ========================================
// ENHANCED PROFIT GUARDRAILS (BLOCKING ENFORCEMENT)
// ========================================

/**
 * Product validation result with blocking logic
 */
export interface ProductValidationResult {
  canLaunch: boolean;
  blocked: boolean;
  issues: ProductValidationIssue[];
  recommendations: PricingRecommendation[];
  marginAnalysis: MarginAnalysis;
  worstCaseSimulation: WorstCaseScenario;
}

export interface ProductValidationIssue {
  severity: 'critical' | 'warning' | 'info';
  field: string;
  message: string;
  blockingIssue: boolean;
}

export interface PricingRecommendation {
  recommendedPriceCents: number;
  expectedMarginBps: number;
  rationale: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface MarginAnalysis {
  currentMarginBps: number;
  netMarginAfterFeesBps: number;
  minimumRequiredMarginBps: number;
  marginBuffer: number; // How much above minimum
  status: 'safe' | 'marginal' | 'unsafe';
}

export interface WorstCaseScenario {
  lowConversionRateBps: number; // 200 = 2%
  highCacCents: number;
  refundRateBps: number; // 500 = 5%
  shippingOverrunBps: number; // 1000 = 10%
  effectiveMarginBps: number;
  breakEvenProbability: number; // 0.0 to 1.0
  recommendation: 'launch' | 'revise' | 'block';
}

/**
 * BLOCKING VALIDATION: No product launches below 20% net margin
 */
export async function validateProductLaunch(args: {
  productCostCents: number;
  sellingPriceCents: number;
  shippingCostCents: number;
  storeId: string;
  supabaseClient?: SupabaseClient;
}): Promise<ProductValidationResult> {
  const { productCostCents, sellingPriceCents, shippingCostCents, storeId, supabaseClient } = args;

  const config = await getProfitFirstConfig(storeId, supabaseClient);
  const _minMarginBps = config?.minMarginBps || 2000; // Default: 20% floor
  const platformFeeBps = config?.platformFeeBps || 500; // Default: 5%
  const refundReserveBps = config?.refundReserveBps || 400; // Default: 4%

  const issues: ProductValidationIssue[] = [];
  const recommendations: PricingRecommendation[] = [];

  // Calculate total cost
  const totalCostCents = productCostCents + shippingCostCents;

  // Calculate current margin
  const grossProfitCents = sellingPriceCents - totalCostCents;
  const grossMarginBps = sellingPriceCents > 0 
    ? Math.floor((grossProfitCents * 10000) / sellingPriceCents) 
    : 0;

  // Calculate net margin after fees
  const platformFeeCents = Math.floor((sellingPriceCents * platformFeeBps) / 10000);
  const refundReserveCents = Math.floor((sellingPriceCents * refundReserveBps) / 10000);
  const netProfitCents = sellingPriceCents - totalCostCents - platformFeeCents - refundReserveCents;
  const netMarginBps = sellingPriceCents > 0 
    ? Math.floor((netProfitCents * 10000) / sellingPriceCents) 
    : 0;

  // CRITICAL: Check 20% floor
  if (netMarginBps < 2000) {
    issues.push({
      severity: 'critical',
      field: 'margin',
      message: `Net margin ${(netMarginBps / 100).toFixed(1)}% is below the mandatory 20% floor. This product CANNOT launch.`,
      blockingIssue: true,
    });
  }

  // Check cost validation
  if (productCostCents <= 0) {
    issues.push({
      severity: 'critical',
      field: 'productCost',
      message: 'Product cost must be greater than zero',
      blockingIssue: true,
    });
  }

  if (sellingPriceCents <= totalCostCents) {
    issues.push({
      severity: 'critical',
      field: 'sellingPrice',
      message: 'Selling price cannot be less than or equal to total cost (negative margin)',
      blockingIssue: true,
    });
  }

  // Check shipping validation
  if (shippingCostCents < 0) {
    issues.push({
      severity: 'critical',
      field: 'shippingCost',
      message: 'Shipping cost cannot be negative',
      blockingIssue: true,
    });
  }

  // Margin buffer analysis
  const marginBuffer = netMarginBps - 2000; // Distance from 20% floor
  let marginStatus: 'safe' | 'marginal' | 'unsafe' = 'unsafe';
  
  if (netMarginBps >= 3000) {
    marginStatus = 'safe'; // 30%+ margin
  } else if (netMarginBps >= 2000) {
    marginStatus = 'marginal'; // 20-30% margin
    issues.push({
      severity: 'warning',
      field: 'margin',
      message: `Margin ${(netMarginBps / 100).toFixed(1)}% is close to the 20% floor. Consider increasing price for safety buffer.`,
      blockingIssue: false,
    });
  } else {
    marginStatus = 'unsafe'; // <20% margin (already blocked above)
  }

  const marginAnalysis: MarginAnalysis = {
    currentMarginBps: grossMarginBps,
    netMarginAfterFeesBps: netMarginBps,
    minimumRequiredMarginBps: 2000,
    marginBuffer,
    status: marginStatus,
  };

  // WORST-CASE SIMULATION
  const worstCase = simulateWorstCaseScenario({
    sellingPriceCents,
    productCostCents,
    shippingCostCents,
    platformFeeBps,
    refundReserveBps,
  });

  if (worstCase.effectiveMarginBps < 1500) {
    issues.push({
      severity: 'warning',
      field: 'worstCase',
      message: `Worst-case margin ${(worstCase.effectiveMarginBps / 100).toFixed(1)}% is below 15%. High risk of losses in adverse conditions.`,
      blockingIssue: false,
    });
  }

  // PRICING RECOMMENDATIONS
  if (netMarginBps < 3000) {
    const recommendedPriceCents = calculateOptimalPrice({
      productCostCents,
      shippingCostCents,
      platformFeeBps,
      refundReserveBps,
      targetMarginBps: 3000, // Target 30% margin for safety
    });

    recommendations.push({
      recommendedPriceCents,
      expectedMarginBps: 3000,
      rationale: `Increase price to ₾${(recommendedPriceCents / 100).toFixed(2)} to achieve a safe 30% net margin with buffer against cost fluctuations.`,
      confidence: 'high',
    });
  }

  if (shippingCostCents > productCostCents * 0.5) {
    issues.push({
      severity: 'warning',
      field: 'shippingCost',
      message: 'Shipping cost exceeds 50% of product cost. Consider bundling products or optimizing carrier selection.',
      blockingIssue: false,
    });
  }

  // FINAL VERDICT
  const hasBlockingIssues = issues.some((issue) => issue.blockingIssue);
  const canLaunch = !hasBlockingIssues;

  return {
    canLaunch,
    blocked: hasBlockingIssues,
    issues,
    recommendations,
    marginAnalysis,
    worstCaseSimulation: worstCase,
  };
}

/**
 * Simulate worst-case scenario (low conversion, high CAC, refunds, shipping errors)
 */
export function simulateWorstCaseScenario(args: {
  sellingPriceCents: number;
  productCostCents: number;
  shippingCostCents: number;
  platformFeeBps: number;
  refundReserveBps: number;
}): WorstCaseScenario {
  const { sellingPriceCents, productCostCents, shippingCostCents, platformFeeBps, refundReserveBps } = args;

  // Worst-case assumptions
  const lowConversionRateBps = 200; // 2% conversion (vs typical 3-5%)
  const highCacCents = 1000; // ₾10 CAC (vs typical ₾7)
  const refundRateBps = 500; // 5% refund rate
  const shippingOverrunBps = 1000; // 10% shipping cost overrun

  // Calculate effective costs under worst case
  const totalBaseCostCents = productCostCents + shippingCostCents;
  const shippingOverrunCents = Math.floor((shippingCostCents * shippingOverrunBps) / 10000);
  const adjustedCostCents = totalBaseCostCents + shippingOverrunCents;

  const platformFeeCents = Math.floor((sellingPriceCents * platformFeeBps) / 10000);
  const refundReserveCents = Math.floor((sellingPriceCents * refundReserveBps) / 10000);
  const refundLossCents = Math.floor((sellingPriceCents * refundRateBps) / 10000);

  // Effective profit after all worst-case deductions
  const effectiveProfitCents = 
    sellingPriceCents - adjustedCostCents - platformFeeCents - refundReserveCents - refundLossCents - highCacCents;

  const effectiveMarginBps = sellingPriceCents > 0 
    ? Math.floor((effectiveProfitCents * 10000) / sellingPriceCents) 
    : 0;

  // Break-even probability (simple model based on margin buffer)
  let breakEvenProbability = 0.5; // Default 50%
  if (effectiveMarginBps >= 2000) {
    breakEvenProbability = 0.95; // 95% chance of profit
  } else if (effectiveMarginBps >= 1500) {
    breakEvenProbability = 0.75; // 75% chance
  } else if (effectiveMarginBps >= 1000) {
    breakEvenProbability = 0.50; // 50% chance
  } else if (effectiveMarginBps >= 500) {
    breakEvenProbability = 0.25; // 25% chance
  } else {
    breakEvenProbability = 0.05; // 5% chance (high risk)
  }

  // Recommendation based on worst-case margin
  let recommendation: 'launch' | 'revise' | 'block' = 'block';
  if (effectiveMarginBps >= 2000) {
    recommendation = 'launch'; // Safe even in worst case
  } else if (effectiveMarginBps >= 1500) {
    recommendation = 'revise'; // Marginal - suggest price increase
  } else {
    recommendation = 'block'; // Too risky
  }

  return {
    lowConversionRateBps,
    highCacCents,
    refundRateBps,
    shippingOverrunBps,
    effectiveMarginBps,
    breakEvenProbability,
    recommendation,
  };
}

/**
 * Calculate optimal price to achieve target margin
 */
export function calculateOptimalPrice(args: {
  productCostCents: number;
  shippingCostCents: number;
  platformFeeBps: number;
  refundReserveBps: number;
  targetMarginBps: number; // Desired net margin (e.g., 3000 = 30%)
}): number {
  const { productCostCents, shippingCostCents, platformFeeBps, refundReserveBps, targetMarginBps } = args;

  const totalCostCents = productCostCents + shippingCostCents;
  const totalFeeBps = platformFeeBps + refundReserveBps;

  // Formula: price = cost / (1 - (targetMargin + totalFees) / 10000)
  const requiredPriceCents = Math.ceil(totalCostCents / (1 - (targetMarginBps + totalFeeBps) / 10000));

  return requiredPriceCents;
}

/**
 * AUTOMATIC PRICING ADJUSTMENT ENGINE
 * Suggests price adjustments to maintain margin compliance
 */
export interface PricingAdjustment {
  currentPriceCents: number;
  suggestedPriceCents: number;
  adjustmentCents: number;
  adjustmentPercentage: number;
  reason: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
}

export async function suggestPricingAdjustments(args: {
  productId: string;
  storeId: string;
  marketConditions?: {
    competitorPriceCents?: number;
    demandTrend?: 'increasing' | 'stable' | 'decreasing';
  };
  supabaseClient?: SupabaseClient;
}): Promise<PricingAdjustment | null> {
  const { productId: _productId, storeId, marketConditions: _marketConditions, supabaseClient } = args;

  // TODO: Fetch product details from database
  // For now, this is a framework for future implementation

  const _config = await getProfitFirstConfig(storeId, supabaseClient);
  const _targetMarginBps = 3000; // 30% target for safety

  // Placeholder return
  return null;
}

/**
 * MARGIN PROTECTION MODE
 * Prevents price reductions that would violate margin floors
 */
export function validatePriceChange(args: {
  currentPriceCents: number;
  newPriceCents: number;
  productCostCents: number;
  shippingCostCents: number;
  platformFeeBps: number;
  refundReserveBps: number;
  minMarginBps: number;
}): {
  allowed: boolean;
  reason?: string;
  minimumAllowedPriceCents: number;
} {
  const {
    currentPriceCents: _currentPriceCents,
    newPriceCents,
    productCostCents,
    shippingCostCents,
    platformFeeBps,
    refundReserveBps,
    minMarginBps,
  } = args;

  const minimumAllowedPriceCents = calculateOptimalPrice({
    productCostCents,
    shippingCostCents,
    platformFeeBps,
    refundReserveBps,
    targetMarginBps: minMarginBps,
  });

  if (newPriceCents < minimumAllowedPriceCents) {
    return {
      allowed: false,
      reason: `Price reduction to ₾${(newPriceCents / 100).toFixed(2)} would violate the ${(minMarginBps / 100).toFixed(0)}% margin floor. Minimum allowed price: ₾${(minimumAllowedPriceCents / 100).toFixed(2)}`,
      minimumAllowedPriceCents,
    };
  }

  return {
    allowed: true,
    minimumAllowedPriceCents,
  };
}
