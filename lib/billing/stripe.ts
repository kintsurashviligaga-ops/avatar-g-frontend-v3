/**
 * Avatar G - Stripe Integration (Server-Only)
 * SECURITY: This file must only run on the server. Never import in client components.
 */

import Stripe from 'stripe';
import { getServerEnv } from '@/lib/env/server';

// Initialize Stripe (lazy singleton)
let stripeInstance: Stripe | null = null;

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
