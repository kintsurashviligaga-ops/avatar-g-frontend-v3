/**
 * Order Total Computation with Tax Awareness
 * Single source of truth for order calculations
 */

import { StoreTaxProfile } from './taxProfile';
import { computeVatInclusive } from './vat';
import { safeRound } from './money';

export interface OrderCalculationInput {
  subtotalCents: number;
  shippingCostCents: number;
  platformFeeBps: number; // basis points
  affiliateFeeBps: number; // basis points
  buyerCountryCode: string;
  taxProfile: StoreTaxProfile;
}

export interface OrderCalculationResult {
  subtotalCents: number;
  vatAmountCents: number;
  vatRateBps: number;
  vatEnabled: boolean;
  shippingCostCents: number;
  platformFeeCents: number;
  affiliateFeeCents: number;
  totalCents: number;
  netSellerCents: number; // Seller receives after fees and VAT
  breakdown: {
    gross: number;
    vatTax: number;
    platformFee: number;
    affiliateFee: number;
    shipping: number;
    total: number;
  };
}

/**
 * Compute order totals with proper VAT handling based on store tax status
 * Server-side single source of truth - never trust client calculations
 */
export function computeOrderTotals(input: OrderCalculationInput): OrderCalculationResult {
  const {
    subtotalCents,
    shippingCostCents,
    platformFeeBps,
    affiliateFeeBps,
    buyerCountryCode,
    taxProfile,
  } = input;

  // Ensure positive values
  const subtotal = Math.max(0, safeRound(subtotalCents));
  const shipping = Math.max(0, safeRound(shippingCostCents));

  // Determine if VAT applies
  // VAT only applies if:
  // 1. Store is VAT payer, AND
  // 2. Buyer is in Georgia
  const shouldApplyVat = taxProfile.vat_enabled && buyerCountryCode === 'GE';

  // Compute VAT (if applicable)
  let vatAmount = 0;
  if (shouldApplyVat) {
    const vatResult = computeVatInclusive(subtotal, taxProfile.vat_rate_bps);
    vatAmount = vatResult.vat_amount_cents;
  }

  // Platform fee: applied to subtotal (percentage-based)
  const platformFee = Math.floor((subtotal * platformFeeBps) / 10000);

  // Affiliate fee: applied to subtotal (percentage-based)
  const affiliateFee = Math.floor((subtotal * affiliateFeeBps) / 10000);

  // Total = subtotal + shipping + platform fee + affiliate fee
  // (VAT already included in subtotal if applicable)
  const total = subtotal + shipping + platformFee + affiliateFee;

  // Net to seller = subtotal - VAT - platform fee - affiliate fee + shipping
  const netSeller = subtotal - vatAmount - platformFee - affiliateFee + shipping;

  return {
    subtotalCents: subtotal,
    vatAmountCents: vatAmount,
    vatRateBps: shouldApplyVat ? taxProfile.vat_rate_bps : 0,
    vatEnabled: shouldApplyVat,
    shippingCostCents: shipping,
    platformFeeCents: platformFee,
    affiliateFeeCents: affiliateFee,
    totalCents: total,
    netSellerCents: netSeller,
    breakdown: {
      gross: subtotal,
      vatTax: vatAmount,
      platformFee: platformFee,
      affiliateFee: affiliateFee,
      shipping: shipping,
      total: total,
    },
  };
}

/**
 * Format order totals for display/logging
 */
export function formatOrderTotals(result: OrderCalculationResult): {
  subtotal: string;
  vat: string;
  shipping: string;
  platformFee: string;
  affiliateFee: string;
  total: string;
  netSeller: string;
} {
  return {
    subtotal: `${result.subtotalCents / 100}₾`,
    vat: `${result.vatAmountCents / 100}₾`,
    shipping: `${result.shippingCostCents / 100}₾`,
    platformFee: `${result.platformFeeCents / 100}₾`,
    affiliateFee: `${result.affiliateFeeCents / 100}₾`,
    total: `${result.totalCents / 100}₾`,
    netSeller: `${result.netSellerCents / 100}₾`,
  };
}

/**
 * Validate order calculation: ensure all values are non-negative and consistent
 */
export function validateOrderCalculation(result: OrderCalculationResult): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (result.subtotalCents < 0) {
    errors.push('Subtotal cannot be negative');
  }

  if (result.vatAmountCents < 0) {
    errors.push('VAT amount cannot be negative');
  }

  if (result.shippingCostCents < 0) {
    errors.push('Shipping cost cannot be negative');
  }

  if (result.platformFeeCents < 0) {
    errors.push('Platform fee cannot be negative');
  }

  if (result.affiliateFeeCents < 0) {
    errors.push('Affiliate fee cannot be negative');
  }

  if (result.totalCents < 0) {
    errors.push('Total cannot be negative');
  }

  // VAT should never exceed the subtotal
  if (result.vatAmountCents > result.subtotalCents) {
    errors.push('VAT amount cannot exceed subtotal');
  }

  // VAT should be 0 if not enabled
  if (!result.vatEnabled && result.vatAmountCents !== 0) {
    errors.push('VAT must be 0 if not enabled');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
