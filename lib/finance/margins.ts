/**
 * Profit optimization and margin calculation
 * Used across online shop, dropshipping, marketplace, and affiliate systems
 */

export interface MarginCalculatorInput {
  costCents: number; // Cost of goods/service
  shippingCents?: number; // Optional shipping cost
  paymentFeePct?: number; // Stripe or payment processor fee %
  platformFeePct?: number; // Platform fee %
  affiliateFeePct?: number; // Affiliate commission %
  isVatPayer: boolean;
  vatRate: number; // 18.00 for Georgia
  desiredProfitPct?: number; // Alternative: desired profit margin%
  desiredProfitCents?: number; // Alternative: desired profit amount
}

export interface MarginCalculatorOutput {
  recommendedPriceCents: number;
  grossMarginPct: number;
  netProfitCents: number;
  breakdown: {
    revenue: number;
    vat: number;
    cost: number;
    shipping: number;
    paymentFee: number;
    platformFee: number;
    affiliateFee: number;
    netProfit: number;
  };
}

/**
 * Calculate recommended selling price based on costs and desired margin
 *
 * Formula:
 * 1. Start with cost + shipping
 * 2. Add payment processing fee
 * 3. Add platform fee
 * 4. Add desired profit margin
 * 5. Apply VAT if applicable
 * 6. Apply affiliate commission if applicable
 *
 * All calculations done in cents (1/100 unit) for precision
 */
export function calculateMargin(input: MarginCalculatorInput): MarginCalculatorOutput {
  const {
    costCents,
    shippingCents = 0,
    paymentFeePct = 2.9, // Stripe default
    platformFeePct = 30, // Platform marketplace fee
    affiliateFeePct = 0,
    isVatPayer,
    vatRate = 18.0,
    desiredProfitPct = 30, // Default 30% margin
  } = input;

  const baseCost = costCents + shippingCents;

  // If no desired profit specified, use percentage
  const targetProfitCents = input.desiredProfitCents !== undefined ? input.desiredProfitCents : Math.ceil((baseCost * desiredProfitPct) / 100);

  // Start with base cost + target profit
  const priceBeforeFees = baseCost + targetProfitCents;

  // Calculate payment fee (applied to final price)
  const paymentFeeCents = Math.ceil((priceBeforeFees * paymentFeePct) / 100);

  // Calculate platform fee (applied to final price)
  const platformFeeCents = Math.ceil((priceBeforeFees * platformFeePct) / 100);

  // Calculate affiliate fee (applied to final price)
  const affiliateFeeCents = Math.ceil((priceBeforeFees * affiliateFeePct) / 100);

  // Total fees
  const totalFeesCents = paymentFeeCents + platformFeeCents + affiliateFeeCents;

  // Final price before VAT
  let finalPrice = priceBeforeFees + totalFeesCents;

  // Apply VAT if applicable (VAT is on top for B2B, included for B2C)
  // For simplicity, we assume VAT is included in the price (B2C model)
  let vatCents = 0;
  if (isVatPayer) {
    vatCents = Math.ceil((finalPrice * vatRate) / 100);
    finalPrice += vatCents;
  }

  // Calculate actual profit after all fees
  const actualNetProfit = finalPrice - costCents - shippingCents - paymentFeeCents - platformFeeCents - affiliateFeeCents - vatCents;

  // Calculate gross margin
  const grossMarginPct = Math.round(((finalPrice - costCents - shippingCents) / finalPrice) * 100 * 100) / 100;

  return {
    recommendedPriceCents: finalPrice,
    grossMarginPct,
    netProfitCents: actualNetProfit,
    breakdown: {
      revenue: finalPrice,
      vat: vatCents,
      cost: costCents,
      shipping: shippingCents,
      paymentFee: paymentFeeCents,
      platformFee: platformFeeCents,
      affiliateFee: affiliateFeeCents,
      netProfit: actualNetProfit,
    },
  };
}

/**
 * Reverse calculation: given a selling price, what's the actual margin?
 * Useful for validation
 */
export function analyzePrice(input: {
  sellingPriceCents: number;
  costCents: number;
  shippingCents?: number;
  paymentFeePct?: number;
  platformFeePct?: number;
  affiliateFeePct?: number;
  isVatPayer: boolean;
  vatRate: number;
}): MarginCalculatorOutput {
  const {
    sellingPriceCents,
    costCents,
    shippingCents = 0,
    paymentFeePct = 2.9,
    platformFeePct = 30,
    affiliateFeePct = 0,
    isVatPayer,
    vatRate = 18.0,
  } = input;

  // Work backwards from selling price
  let priceAfterVat = sellingPriceCents;
  let vatCents = 0;

  if (isVatPayer) {
    // Remove VAT from final price
    vatCents = Math.ceil((priceAfterVat * vatRate) / (100 + vatRate));
    priceAfterVat -= vatCents;
  }

  // Calculate fees based on revenue
  const paymentFeeCents = Math.ceil((priceAfterVat * paymentFeePct) / 100);
  const platformFeeCents = Math.ceil((priceAfterVat * platformFeePct) / 100);
  const affiliateFeeCents = Math.ceil((priceAfterVat * affiliateFeePct) / 100);

  // Actual net profit
  const netProfit = priceAfterVat - costCents - shippingCents - paymentFeeCents - platformFeeCents - affiliateFeeCents;

  // Gross margin
  const grossMarginPct = Math.round(((priceAfterVat - costCents - shippingCents) / sellingPriceCents) * 10000) / 100;

  return {
    recommendedPriceCents: sellingPriceCents,
    grossMarginPct,
    netProfitCents: netProfit,
    breakdown: {
      revenue: priceAfterVat,
      vat: vatCents,
      cost: costCents,
      shipping: shippingCents,
      paymentFee: paymentFeeCents,
      platformFee: platformFeeCents,
      affiliateFee: affiliateFeeCents,
      netProfit,
    },
  };
}

/**
 * Currency conversion helper
 * Uses FX rate from business profile
 */
export function convertCurrency(
  amountCents: number,
  fromCurrency: 'GEL' | 'USD',
  toCurrency: 'GEL' | 'USD',
  fxRateGelPerUsd: number,
): number {
  if (fromCurrency === toCurrency) {
    return amountCents;
  }

  if (fromCurrency === 'GEL' && toCurrency === 'USD') {
    // GEL to USD: divide by FX rate
    return Math.ceil(amountCents / fxRateGelPerUsd);
  } else if (fromCurrency === 'USD' && toCurrency === 'GEL') {
    // USD to GEL: multiply by FX rate
    return Math.ceil(amountCents * fxRateGelPerUsd);
  }

  return amountCents;
}

/**
 * Format currency for display
 */
export function formatCurrency(cents: number, currency: 'GEL' | 'USD'): string {
  const amount = (cents / 100).toFixed(2);
  return currency === 'GEL' ? `₾${amount}` : `$${amount}`;
}
