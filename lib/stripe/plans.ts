/**
 * Stripe Subscription Plans Configuration
 * 
 * Define your products and prices here.
 * These should match your Stripe Dashboard configuration.
 */

export const SUBSCRIPTION_PLANS = {
  starter: {
    name: 'Starter',
    amountMonthlyUSD: 9.99,
    amountYearlyUSD: 99.9,
    priceMonthly: 'price_starter_monthly', // Replace with actual Stripe Price ID
    priceYearly: 'price_starter_yearly',   // Replace with actual Stripe Price ID
    features: [
      '10 avatars per month',
      '100 videos per month',
      '10 songs per month',
      'Basic support',
    ],
  },
  pro: {
    name: 'Pro',
    amountMonthlyUSD: 29.99,
    amountYearlyUSD: 299.9,
    priceMonthly: 'price_pro_monthly',
    priceYearly: 'price_pro_yearly',
    features: [
      'Unlimited avatars',
      'Unlimited videos',
      'Unlimited music',
      'Priority support',
      'API access',
    ],
  },
  business: {
    name: 'Empire',
    amountMonthlyUSD: 99.99,
    amountYearlyUSD: 999.9,
    priceMonthly: 'price_business_monthly',
    priceYearly: 'price_business_yearly',
    features: [
      'All Pro features',
      'Custom integrations',
      'Dedicated account manager',
      'SLA guarantee',
      'White-label options',
    ],
  },
} as const;

export const SUBSCRIPTION_CONFIG = {
  trialDays: 7,
  currency: 'USD',
  gelRate: 2.7,
};

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS;
export type BillingInterval = 'monthly' | 'yearly';

/**
 * Get Stripe Price ID for a plan and billing interval
 */
export function getPriceId(plan: SubscriptionPlan, interval: BillingInterval): string {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  return interval === 'monthly' ? planConfig.priceMonthly : planConfig.priceYearly;
}

/**
 * Validate if a price ID belongs to our configured plans
 */
export function isValidPriceId(priceId: string): boolean {
  const allPriceIds: string[] = Object.values(SUBSCRIPTION_PLANS).flatMap((plan) => [
    plan.priceMonthly,
    plan.priceYearly,
  ]);
  return allPriceIds.includes(priceId);
}

/**
 * Get plan name from Stripe Price ID
 */
export function getPlanFromPriceId(priceId: string): SubscriptionPlan | null {
  for (const [planKey, planConfig] of Object.entries(SUBSCRIPTION_PLANS)) {
    if (planConfig.priceMonthly === priceId || planConfig.priceYearly === priceId) {
      return planKey as SubscriptionPlan;
    }
  }
  return null;
}

/**
 * Script to create products and prices in Stripe
 * Run this once: node --loader ts-node/esm lib/stripe/setup-products.ts
 */
export const SETUP_INSTRUCTIONS = `
To set up products in Stripe Dashboard:

1. Go to https://dashboard.stripe.com/products
2. Create three products: Starter, Pro, Business
3. For each product, create two prices:
   - Monthly recurring
   - Yearly recurring (with discount)
4. Copy the Price IDs and update this file
5. Configure webhook endpoint: https://yourdomain.com/api/stripe/webhook

Example Price IDs format:
- price_1ABC123... (for monthly)
- price_1XYZ789... (for yearly)
`;
