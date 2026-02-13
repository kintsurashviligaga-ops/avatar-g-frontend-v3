/**
 * Margin Calculation & Enforcement
 * Server-side only - prevents unprofitable products from being published
 * 
 * All money values are in cents (integers).
 * Margin thresholds are enforced at product publish/import time.
 */

'use server';

import { ProductMargin } from '@/lib/commerce/types';

// ============================================
// MARGIN THRESHOLDS (basis points: 1 = 0.01%)
// ============================================

export const MARGIN_THRESHOLDS = {
  digital: 7000, // 70% minimum for digital goods
  dropshipping: 2500, // 25% minimum for dropshipping
  physical: 1500, // 15% minimum for standard physical products
  default: 1500, // 15% default fallback
};

export const FEE_BASIS_POINTS = {
  platformFee: 500, // 5% platform fee
  affiliate: 500, // 5% affiliate fee (if applicable)
  refundReserve: 200, // 2% refund reserve buffer
};

// ============================================
// COMPUTE MARGIN
// ============================================

export interface ComputeMarginInput {
  retailPriceCents: number; // Total price including VAT (in cents)
  costPriceCents: number; // Supplier cost
  shippingCostCents: number; // Final shipping cost
  vatAmountCents?: number; // VAT component (if not recalculated)
  vatRate?: number; // VAT rate in basis points (1800 = 18%)
  platformFeeBps?: number; // Custom platform fee (default 500 = 5%)
  affiliateFeeBps?: number; // Custom affiliate fee (default 500 = 5%)
  productType?: 'physical' | 'digital' | 'dropshipping' | 'service'; // For threshold selection
}

/**
 * Compute complete margin breakdown with threshold validation
 * 
 * Formula:
 * Net = RetailPrice - VAT - CostPrice - ShippingCost - PlatformFee - AffiliateFee - RefundReserve
 * Margin% = (Net / RetailPrice) * 100
 * 
 * Returns rejection if margin is negative or below threshold.
 */
export function computeMargin(input: ComputeMarginInput): ProductMargin {
  // Extract inputs with defaults
  const retailPriceCents = input.retailPriceCents || 0;
  const costPriceCents = input.costPriceCents || 0;
  const shippingCostCents = input.shippingCostCents || 0;
  const vatRate = input.vatRate || 1800; // 18% Georgia standard
  const platformFeeBps = input.platformFeeBps || FEE_BASIS_POINTS.platformFee;
  const affiliateFeeBps = input.affiliateFeeBps || FEE_BASIS_POINTS.affiliate;

  // Calculate VAT from retail price (VAT is included in retail price)
  // Formula: VAT = RetailPrice * VATRate / (100 + VATRate) for inclusive taxation
  // For 18% VAT: VAT = Price * 1800 / 11800
  const vatAmountCents = input.vatAmountCents
    ? input.vatAmountCents
    : Math.round((retailPriceCents * (vatRate / 10000)) / (1 + vatRate / 10000));

  // Calculate fees from the base price (after VAT is removed)
  const basePriceCents = retailPriceCents - vatAmountCents;

  // Platform fee: percentage of base price
  const platformFeeAmountCents = Math.round(
    (basePriceCents * platformFeeBps) / 10000
  );

  // Affiliate fee: percentage of base price (if applicable)
  const affiliateFeeAmountCents = Math.round(
    (basePriceCents * affiliateFeeBps) / 10000
  );

  // Refund reserve: percentage of base price (safety buffer)
  const refundReserveCents = Math.round(
    (basePriceCents * FEE_BASIS_POINTS.refundReserve) / 10000
  );

  // Net profit calculation
  const netProfitCents =
    basePriceCents -
    costPriceCents -
    shippingCostCents -
    platformFeeAmountCents -
    affiliateFeeAmountCents -
    refundReserveCents;

  // Margin percentage (how much profit as % of retail price)
  const marginPercent =
    retailPriceCents > 0
      ? (netProfitCents / retailPriceCents) * 100
      : 0;

  // Determine threshold based on product type
  const productType = input.productType || 'physical';
  const minThresholdBps =
    MARGIN_THRESHOLDS[productType as keyof typeof MARGIN_THRESHOLDS] ||
    MARGIN_THRESHOLDS.default;
  const minThresholdPercent = minThresholdBps / 100;

  // Check if margin meets threshold
  const isPositiveMargin = netProfitCents > 0;
  const meetsThreshold = marginPercent >= minThresholdPercent;

  // Build response
  const result: ProductMargin = {
    retailPrice: retailPriceCents,
    costPrice: costPriceCents,
    shippingCost: shippingCostCents,
    platformFeeAmount: platformFeeAmountCents,
    affiliateFeeAmount: affiliateFeeAmountCents,
    refundReserveCents,
    vatAmount: vatAmountCents,
    netProfitCents,
    marginPercent: Math.round(marginPercent * 100) / 100, // Round to 2 decimals
    isPositiveMargin,
    meetsThreshold,
    minThresholdPercent,
  };

  // Add rejection reason if margin is too low
  if (!meetsThreshold) {
    const requiredNetCents = Math.round(
      (retailPriceCents * minThresholdBps) / 10000
    );
    const shortfall = requiredNetCents - netProfitCents;

    result.rejection = {
      reason: 'margin_below_threshold',
      message: `Rejected: ${productType} product margin (${marginPercent.toFixed(2)}%) below minimum (${minThresholdPercent}%). Need ${(shortfall / 100).toFixed(2)} more USD in net profit. Increase price or reduce costs.`,
    };
  }

  return result;
}

// ============================================
// VALIDATE PRODUCT FOR PUBLISHING
// ============================================

export interface ValidateProductInput {
  retailPriceCents: number;
  costPriceCents: number;
  shippingCostCents: number;
  productType: 'physical' | 'digital' | 'dropshipping' | 'service';
  vatRate?: number;
}

/**
 * Validate that product can be published (margin check pass/fail)
 * Returns { valid: boolean, margin: ProductMargin, error?: string }
 */
export function validateProductForPublishing(
  input: ValidateProductInput
): {
  valid: boolean;
  margin: ProductMargin;
  error?: string;
} {
  const margin = computeMargin({
    retailPriceCents: input.retailPriceCents,
    costPriceCents: input.costPriceCents,
    shippingCostCents: input.shippingCostCents,
    productType: input.productType,
    vatRate: input.vatRate || 1800,
  });

  if (!margin.meetsThreshold) {
    return {
      valid: false,
      margin,
      error: margin.rejection?.message,
    };
  }

  if (!margin.isPositiveMargin) {
    return {
      valid: false,
      margin,
      error: 'Rejected: Product would lose money on each sale (negative margin).',
    };
  }

  return {
    valid: true,
    margin,
  };
}

// ============================================
// BULK MARGIN CHECK (for supplier imports)
// ============================================

export interface BulkMarginCheckInput {
  products: Array<{
    id: string;
    retailPriceCents: number;
    costPriceCents: number;
    shippingCostCents: number;
    productType: 'physical' | 'digital' | 'dropshipping';
  }>;
}

export interface BulkMarginCheckResult {
  total: number;
  approved: number;
  rejected: number;
  results: Array<{
    productId: string;
    valid: boolean;
    marginPercent: number;
    minThresholdPercent: number;
    rejectionReason?: string;
  }>;
}

/**
 * Bulk margin validation for supplier product imports
 * Returns summary + detailed results for each product
 */
export function bulkMarginCheck(input: BulkMarginCheckInput): BulkMarginCheckResult {
  let approved = 0;
  let rejected = 0;

  const results = input.products.map((product) => {
    const validation = validateProductForPublishing({
      retailPriceCents: product.retailPriceCents,
      costPriceCents: product.costPriceCents,
      shippingCostCents: product.shippingCostCents,
      productType: product.productType,
    });

    if (validation.valid) {
      approved++;
    } else {
      rejected++;
    }

    return {
      productId: product.id,
      valid: validation.valid,
      marginPercent: validation.margin.marginPercent,
      minThresholdPercent: validation.margin.minThresholdPercent,
      rejectionReason: validation.error,
    };
  });

  return {
    total: input.products.length,
    approved,
    rejected,
    results,
  };
}

// ============================================
// DEBUG: Format margin for logging/display
// ============================================

export function formatMargin(margin: ProductMargin): string {
  const lines = [
    `=== Product Margin Breakdown ===`,
    `Retail Price: $${(margin.retailPrice / 100).toFixed(2)}`,
    `  - VAT (18%): $${(margin.vatAmount / 100).toFixed(2)}`,
    `  - Cost: $${(margin.costPrice / 100).toFixed(2)}`,
    `  - Shipping: $${(margin.shippingCost / 100).toFixed(2)}`,
    `  - Platform Fee (5%): $${(margin.platformFeeAmount / 100).toFixed(2)}`,
    `  - Affiliate Fee (5%): $${(margin.affiliateFeeAmount / 100).toFixed(2)}`,
    `  - Refund Reserve (2%): $${(margin.refundReserveCents / 100).toFixed(2)}`,
    ``,
    `NET PROFIT: $${(margin.netProfitCents / 100).toFixed(2)}`,
    `MARGIN: ${margin.marginPercent.toFixed(2)}% (min: ${margin.minThresholdPercent}%)`,
    `STATUS: ${margin.meetsThreshold ? '✅ APPROVED' : '❌ REJECTED'}`,
    margin.rejection ? `REASON: ${margin.rejection.message}` : '',
  ];

  return lines.filter((l) => l !== '').join('\n');
}
