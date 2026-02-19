import Stripe from 'stripe';

// ========================================
// STRIPE CLIENT & INITIALIZATION
// ========================================

let stripe: Stripe | null = null;

/**
 * Get or initialize Stripe client (server-side only)
 */
export function getStripeClient(): Stripe {
  if (!stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable not set');
    }
    stripe = new Stripe(secretKey, {
      apiVersion: '2026-01-28.clover',
    });
  }
  return stripe;
}

/**
 * Map currency code to Stripe format
 */
export function getStripeCurrency(currency: string): string {
  const currencyMap: Record<string, string> = {
    GEL: 'usd', // Fallback to USD if GEL not supported
    USD: 'usd',
    EUR: 'eur',
    GBP: 'gbp',
  };
  return currencyMap[currency] || 'usd';
}

/**
 * Get FX rate (if needed for conversion)
 */
export function getFxRateUsdToGel(): number {
  // In production, fetch from external API or cache
  // For now, use approximate rate
  return 2.7;
}

/**
 * Create a PaymentIntent for an order
 */
export async function createPaymentIntent(args: {
  amountCents: number;
  currency: string;
  orderId: string;
  storeId: string;
  userId: string;
  email?: string;
  metadata?: Record<string, string>;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
}> {
  const client = getStripeClient();

  // Ensure amount is positive
  if (args.amountCents <= 0) {
    throw new Error('Amount must be positive');
  }

  // Map currency
  const stripeCurrency = getStripeCurrency(args.currency);

  // For GEL, if not supported, we'd convert to USD for Stripe
  // In real scenario, confirm Stripe account supports GEL
  let finalAmount = args.amountCents;
  const finalCurrency = stripeCurrency;

  // If Stripe doesn't support GEL, convert to USD for final amount
  if (stripeCurrency === 'usd' && args.currency === 'GEL') {
    const fxRate = getFxRateUsdToGel();
    finalAmount = Math.ceil(args.amountCents / fxRate);
  }

  try {
    const intent = await client.paymentIntents.create({
      amount: finalAmount,
      currency: finalCurrency,
      payment_method_types: ['card'],
      description: `Order ${args.orderId} - Avatar Shop`,
      receipt_email: args.email,
      metadata: {
        orderId: args.orderId,
        storeId: args.storeId,
        userId: args.userId,
        ...args.metadata,
      },
      statement_descriptor: 'AVATAR SHOP',
    });

    return {
      clientSecret: intent.client_secret || '',
      paymentIntentId: intent.id,
      amountCents: finalAmount,
      currency: finalCurrency,
    };
  } catch (error) {
    console.error('Stripe createPaymentIntent error:', error);
    throw new Error('Failed to create payment intent');
  }
}

/**
 * Retrieve a PaymentIntent
 */
export async function getPaymentIntent(paymentIntentId: string): Promise<Stripe.PaymentIntent | null> {
  const client = getStripeClient();
  try {
    return await client.paymentIntents.retrieve(paymentIntentId);
  } catch (error) {
    console.error('Stripe getPaymentIntent error:', error);
    return null;
  }
}

/**
 * Refund a payment
 */
export async function refundPayment(args: {
  paymentIntentId: string;
  amountCents?: number;
  reason?: 'requested_by_customer' | 'duplicate' | 'fraudulent';
}): Promise<Stripe.Refund | null> {
  const client = getStripeClient();
  try {
    return await client.refunds.create({
      payment_intent: args.paymentIntentId,
      amount: args.amountCents,
      reason: args.reason,
    });
  } catch (error) {
    console.error('Stripe refundPayment error:', error);
    return null;
  }
}

/**
 * Extract card details from PaymentIntent
 */
export function extractCardDetails(intent: Stripe.PaymentIntent): {
  last4: string | null;
  brand: string | null;
} {
  const paymentMethod = intent.payment_method;
  if (typeof paymentMethod === 'string') {
    return { last4: null, brand: null };
  }

  if (paymentMethod && paymentMethod.type === 'card' && paymentMethod.card) {
    return {
      last4: paymentMethod.card.last4 || null,
      brand: paymentMethod.card.brand || null,
    };
  }

  return { last4: null, brand: null };
}

/**
 * Map Stripe status to our payment status
 */
export function mapStripeStatus(
  status: string | undefined
): 'created' | 'requires_action' | 'succeeded' | 'failed' | 'refunded' {
  switch (status) {
    case 'requires_payment_method':
      return 'created';
    case 'requires_action':
      return 'requires_action';
    case 'succeeded':
      return 'succeeded';
    case 'processing':
      return 'requires_action';
    case 'canceled':
      return 'failed';
    default:
      return 'failed';
  }
}
