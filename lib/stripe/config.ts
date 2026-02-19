/**
 * Stripe Connect Configuration
 * 
 * Platform commission settings and fee calculations
 */

export const STRIPE_CONNECT_CONFIG = {
  /**
   * Default commission percentage (basis points)
   * 10% = 1000 bps
   * 5% = 500 bps
   */
  DEFAULT_COMMISSION_PERCENTAGE: 10.0,

  /**
   * Commission tiers based on seller volume
   */
  COMMISSION_TIERS: [
    { minVolumeUSD: 0, maxVolumeUSD: 1000, percentage: 15.0 },       // 0-1k: 15%
    { minVolumeUSD: 1000, maxVolumeUSD: 5000, percentage: 12.0 },    // 1k-5k: 12%
    { minVolumeUSD: 5000, maxVolumeUSD: 10000, percentage: 10.0 },   // 5k-10k: 10%
    { minVolumeUSD: 10000, maxVolumeUSD: 50000, percentage: 8.0 },   // 10k-50k: 8%
    { minVolumeUSD: 50000, maxVolumeUSD: Infinity, percentage: 5.0 }, // 50k+: 5%
  ],

  /**
   * Minimum commission amount in cents
   * Ensures platform always gets at least this much
   */
  MIN_COMMISSION_CENTS: 50, // $0.50

  /**
   * Maximum commission amount in cents
   * Caps commission for high-value transactions
   */
  MAX_COMMISSION_CENTS: 10000, // $100.00

  /**
   * Stripe Account Type
   * STANDARD - Seller owns the account, platform never sees secrets
   */
  ACCOUNT_TYPE: 'standard' as const,

  /**
   * Capabilities required for sellers
   */
  REQUIRED_CAPABILITIES: ['card_payments', 'transfers'] as const,

  /**
   * Account Link Settings
   */
  ACCOUNT_LINK_CONFIG: {
    refreshUrl: `${process.env.NEXT_PUBLIC_APP_URL}/seller/connect/refresh`,
    returnUrl: `${process.env.NEXT_PUBLIC_APP_URL}/seller/connect/return`,
    type: 'account_onboarding' as const,
  },
} as const;

/**
 * Calculate commission for a transaction
 */
export function calculateCommission(
  amountCents: number,
  commissionPercentage?: number
): {
  applicationFeeCents: number;
  sellerPayoutCents: number;
  effectiveRate: number;
} {
  const rate = commissionPercentage ?? STRIPE_CONNECT_CONFIG.DEFAULT_COMMISSION_PERCENTAGE;
  
  // Calculate base commission
  let applicationFeeCents = Math.floor((amountCents * rate) / 100);

  // Apply minimum commission
  if (applicationFeeCents < STRIPE_CONNECT_CONFIG.MIN_COMMISSION_CENTS) {
    applicationFeeCents = STRIPE_CONNECT_CONFIG.MIN_COMMISSION_CENTS;
  }

  // Apply maximum commission cap
  if (applicationFeeCents > STRIPE_CONNECT_CONFIG.MAX_COMMISSION_CENTS) {
    applicationFeeCents = STRIPE_CONNECT_CONFIG.MAX_COMMISSION_CENTS;
  }

  // Ensure fee doesn't exceed 50% of transaction (safety check)
  const maxAllowedFee = Math.floor(amountCents * 0.5);
  if (applicationFeeCents > maxAllowedFee) {
    applicationFeeCents = maxAllowedFee;
  }

  const sellerPayoutCents = amountCents - applicationFeeCents;
  const effectiveRate = (applicationFeeCents / amountCents) * 100;

  return {
    applicationFeeCents,
    sellerPayoutCents,
    effectiveRate,
  };
}

/**
 * Get commission percentage for seller based on lifetime volume
 */
export function getCommissionForSeller(lifetimeVolumeUSD: number): number {
  const tier = STRIPE_CONNECT_CONFIG.COMMISSION_TIERS.find(
    (t) => lifetimeVolumeUSD >= t.minVolumeUSD && lifetimeVolumeUSD < t.maxVolumeUSD
  );

  return tier?.percentage ?? STRIPE_CONNECT_CONFIG.DEFAULT_COMMISSION_PERCENTAGE;
}

/**
 * Validate commission percentage
 */
export function isValidCommission(percentage: number): boolean {
  return percentage >= 0 && percentage <= 100;
}

/**
 * Format commission for display
 */
export function formatCommission(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
