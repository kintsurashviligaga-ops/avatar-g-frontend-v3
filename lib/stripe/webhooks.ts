import Stripe from 'stripe';
import { StripeEventRecord } from './types';

// ========================================
// STRIPE WEBHOOK HANDLING
// ========================================

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(args: {
  body: string;
  signature: string;
}): Stripe.Event | null {
  const secretKey = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return null;
  }

  try {
    const event = Stripe.webhooks.constructEvent(args.body, args.signature, secretKey);
    return event;
  } catch (error) {
    console.error('Webhook signature verification failed:', error);
    return null;
  }
}

/**
 * Check if event already processed (idempotency)
 */
export async function isEventProcessed(_eventId: string): Promise<boolean> {
  try {
    // This would check stripe_events table
    // For now, return false (not yet processed)
    // In actual implementation: SELECT FROM stripe_events WHERE id = eventId
    return false;
  } catch (error) {
    console.error('Error checking event:', error);
    return false;
  }
}

/**
 * Log stripe event to database (idempotent)
 */
export async function logStripeEvent(args: {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}): Promise<StripeEventRecord | null> {
  try {
    // In real implementation, use Supabase client:
    // const { data, error } = await supabase
    //   .from('stripe_events')
    //   .insert([{ id: args.id, type: args.type, payload_json: args.payload, created_at: new Date() }])
    //   .select()
    //   .single();
    // For now, mock
    return {
      id: args.id,
      type: args.type,
      processed_at: null,
      payload_json: args.payload,
      created_at: new Date().toISOString(),
      error_log: null,
    };
  } catch (error) {
    console.error('Error logging Stripe event:', error);
    return null;
  }
}

/**
 * Mark event as processed
 */
export async function markEventProcessed(_eventId: string): Promise<void> {
  try {
    // In real implementation, use Supabase:
    // await supabase
    //   .from('stripe_events')
    //   .update({ processed_at: new Date() })
    //   .eq('id', eventId);
  } catch (error) {
    console.error('Error marking event processed:', error);
  }
}

/**
 * Get webhook type
 */
export function getWebhookType(event: Stripe.Event): string | null {
  return event.type || null;
}

/**
 * Extract PaymentIntent from webhook event
 */
export function extractPaymentIntentFromEvent(
  event: Stripe.Event
): Stripe.PaymentIntent | null {
  if (event.type?.startsWith('payment_intent.')) {
    return (event.data.object as Stripe.PaymentIntent) || null;
  }
  return null;
}

/**
 * Extract Charge from webhook event
 */
export function extractChargeFromEvent(event: Stripe.Event): Stripe.Charge | null {
  if (event.type?.startsWith('charge.')) {
    return (event.data.object as Stripe.Charge) || null;
  }
  return null;
}

/**
 * Extract order ID from webhook metadata
 */
export function extractOrderIdFromEvent(event: Stripe.Event): string | null {
  const paymentIntent = extractPaymentIntentFromEvent(event);
  if (paymentIntent?.metadata?.orderId) {
    return paymentIntent.metadata.orderId;
  }

  const charge = extractChargeFromEvent(event);
  if (charge?.metadata?.orderId) {
    return charge.metadata.orderId;
  }

  return null;
}

/**
 * Determine if this is a payment success event
 */
export function isPaymentSuccessEvent(event: Stripe.Event): boolean {
  return event.type === 'payment_intent.succeeded';
}

/**
 * Determine if this is a payment failure event
 */
export function isPaymentFailureEvent(event: Stripe.Event): boolean {
  return event.type === 'payment_intent.payment_failed' || event.type === 'charge.failed';
}

/**
 * Determine if this is a refund event
 */
export function isRefundEvent(event: Stripe.Event): boolean {
  return event.type === 'charge.refunded';
}
