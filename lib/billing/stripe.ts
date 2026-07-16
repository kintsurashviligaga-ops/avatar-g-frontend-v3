/**
 * Avatar G - Stripe Integration (Server-Only)
 * SECURITY: This file must only run on the server. Never import in client components.
 */

import Stripe from 'stripe';
import { getServerEnv } from '@/lib/env/server';
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';

// Initialize Stripe (lazy singleton)
let stripeInstance: Stripe | null = null;

// ── PHASE 39.5 (Master Contract V3) — LAUNCH PAYMENT-ENV PREPARATION ──────────────────────────────────
// The payment router owns ALL Stripe env access and the currency binding. Today's live flow settles in GEL
// (createWalletTopupSession, unchanged); these helpers PREP the layer for the Phase-39 USD ($15/$99/$299)
// launch without touching that working path — the USD session is inert until a route calls it.

/** Currency binding for launch. Defaults to the current GEL wallet flow; set BILLING_CURRENCY=usd to move
 *  settlement to USD once native USD prices are provisioned. Never throws — always resolves to a valid code. */
export function resolveBillingCurrency(): 'usd' | 'gel' {
  return (process.env.BILLING_CURRENCY || '').trim().toLowerCase() === 'usd' ? 'usd' : 'gel';
}

/** The publishable (client) key — parsed HERE so every Stripe env var flows through this module. Null when unset. */
export function getStripePublishableKey(): string | null {
  const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return typeof k === 'string' && k.trim() ? k.trim() : null;
}

/** The exact Phase-39 USD tier bounds — single source (PRICING_TIERS) → [15, 99, 299]. A USD session amount
 *  is VALIDATED against this list so a wrong amount can never reach Stripe. */
export const USD_TIER_PRICES: readonly number[] = PRICING_TIERS.map((t) => t.priceUsd);

export function getStripe(): Stripe {
  if (!stripeInstance) {
    const { STRIPE_SECRET_KEY } = getServerEnv(['STRIPE_SECRET_KEY']);
    
    stripeInstance = new Stripe(STRIPE_SECRET_KEY as string, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  }
  
  return stripeInstance;
}

/**
 * Get or create Stripe customer for user
 */
export async function getOrCreateCustomer(params: {
  userId: string;
  email: string;
  name?: string;
}): Promise<string> {
  const stripe = getStripe();
  
  // Create customer
  const customer = await stripe.customers.create({
    email: params.email,
    name: params.name,
    metadata: {
      userId: params.userId,
    },
  });
  
  return customer.id;
}

/**
 * Create checkout session for subscription
 */
export async function createCheckoutSession(params: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  
  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    mode: 'subscription',
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  });
  
  if (!session.url) {
    throw new Error('Failed to create checkout session URL');
  }
  
  return session.url;
}

/**
 * Create a one-off GEL wallet top-up Checkout Session (mode: payment).
 * Uses inline price_data so the amount is the literal Lari value chosen by the
 * user. NOTE: settlement in GEL requires the Stripe account to support the
 * currency — if it doesn't, Stripe rejects this call and the caller surfaces a
 * clean error (the subscription/plan path still works regardless).
 */
export async function createWalletTopupSession(params: {
  customerId: string;
  amountGel: number;
  successUrl: string;
  cancelUrl: string;
  /** Extra session metadata merged on top of the wallet_topup defaults. */
  metadata?: Record<string, string>;
}): Promise<string> {
  const stripe = getStripe();

  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'gel',
          unit_amount: Math.round(params.amountGel * 100),
          product_data: { name: `MyAvatar Wallet — ${params.amountGel.toFixed(2)} ₾` },
        },
      },
    ],
    metadata: { kind: 'wallet_topup', currency: 'gel', amount_gel: String(params.amountGel), ...(params.metadata ?? {}) },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    billing_address_collection: 'auto',
  });

  if (!session.url) {
    throw new Error('Failed to create wallet top-up session URL');
  }

  return session.url;
}

/**
 * PHASE 39.5 (Master Contract V3) — a USD-denominated tier Checkout Session (mode: payment), ready for the
 * public launch. The currency is HARD-BOUND to 'usd' and the amount is VALIDATED against the exact
 * $15/$99/$299 tier bounds, so a wrong amount can never reach Stripe. Inert until a checkout route calls it;
 * the live GEL wallet path (createWalletTopupSession) is unchanged. Requires native USD prices on the Stripe
 * account (and the credit-grant webhook must map the tier) before going live — see lib/billing/pricingConfig.
 */
export async function createUsdTierCheckoutSession(params: {
  customerId: string;
  priceUsd: number;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<string> {
  if (!USD_TIER_PRICES.includes(params.priceUsd)) {
    throw new Error(`priceUsd must be one of ${USD_TIER_PRICES.join(', ')}`);
  }
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    customer: params.customerId,
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd', // Master Contract V3 — currency verified as USD at the session-creation layer
          unit_amount: Math.round(params.priceUsd * 100),
          product_data: { name: `MyAvatar — $${params.priceUsd}` },
        },
      },
    ],
    metadata: { kind: 'tier_topup', currency: 'usd', amount_usd: String(params.priceUsd), ...(params.metadata ?? {}) },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    billing_address_collection: 'auto',
  });
  if (!session.url) {
    throw new Error('Failed to create USD tier checkout session URL');
  }
  return session.url;
}

/**
 * Create customer portal session
 */
export async function createPortalSession(params: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const stripe = getStripe();
  
  const session = await stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: params.returnUrl,
  });
  
  return session.url;
}

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const stripe = getStripe();
  const { STRIPE_WEBHOOK_SECRET } = getServerEnv(['STRIPE_WEBHOOK_SECRET']);
  
  try {
    return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET as string);
  } catch (err) {
    const error = err as Error;
    throw new Error(`Webhook signature verification failed: ${error.message}`);
  }
}

/**
 * Cancel subscription
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
}

/**
 * Resume subscription
 */
export async function resumeSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: false,
  });
}

/**
 * Get subscription details
 */
export async function getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return await stripe.subscriptions.retrieve(subscriptionId);
}

/**
 * List customer subscriptions
 */
export async function listCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
  const stripe = getStripe();
  const result = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
  });
  return result.data;
}
