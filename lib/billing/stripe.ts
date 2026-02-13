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
      apiVersion: '2026-01-28.clover',
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
