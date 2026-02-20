import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/billing/stripe';
import { 
  upsertSubscription, 
  updateSubscriptionStatus,
  getUserIdFromCustomerId,
  storeCustomerMapping
} from '@/lib/stripe/subscriptions';
import { updateAccountStatus } from '@/lib/stripe/connect';
import { updateCommissionStatus } from '@/lib/stripe/payments';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { recomputeFinanceDailyAggregates } from '@/lib/finance/aggregates';

/**
 * POST /api/stripe/webhook
 * 
 * Webhook handler for Stripe events.
 * Matches the endpoint configured in Stripe Dashboard:
 * https://myavatar.ge/api/stripe/webhook
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Stripe webhooks require Node.js runtime

// ========================================
// IDEMPOTENCY TRACKING
// ========================================

const processedEvents = new Set<string>();

const AFFILIATE_PAYOUT_DELAY_DAYS = Number(process.env.AFFILIATE_PAYOUT_DELAY_DAYS || '7');

async function isEventProcessed(eventId: string): Promise<boolean> {
  // Check in-memory cache first (fast)
  if (processedEvents.has(eventId)) {
    return true;
  }

  // Check database for persistence across restarts
  const supabase = createRouteHandlerClient();
  const { data } = await supabase
    .from('webhook_events')
    .select('id')
    .eq('stripe_event_id', eventId)
    .single();

  return data !== null;
}

async function markEventProcessed(eventId: string): Promise<void> {
  processedEvents.add(eventId);

  // Also store in database for persistence
  const supabase = createRouteHandlerClient();
  const { error } = await supabase
    .from('webhook_events')
    .upsert({
      stripe_event_id: eventId,
      processed_at: new Date().toISOString(),
    }, {
      onConflict: 'stripe_event_id',
    });

  if (error) {
    console.error('[Webhook] Failed to store event in DB:', error);
  }
}

async function getAffiliateForUser(userId: string): Promise<{ affiliateId: string; commissionPercent: number } | null> {
  const supabase = createRouteHandlerClient();

  const { data: referral } = await supabase
    .from('affiliate_referrals')
    .select('affiliate_id')
    .eq('referred_user_id', userId)
    .single();

  if (!referral) {
    return null;
  }

  const { data: affiliate } = await supabase
    .from('affiliates')
    .select('id, commission_percent, is_active')
    .eq('id', referral.affiliate_id)
    .single();

  if (!affiliate || !affiliate.is_active) {
    return null;
  }

  return {
    affiliateId: affiliate.id,
    commissionPercent: Number(affiliate.commission_percent || 0),
  };
}

async function insertCommissionEvent(params: {
  affiliateId: string;
  referredUserId: string;
  stripeEventId: string;
  stripeObjectId: string | null;
  eventType: string;
  currency: string;
  grossAmountCents: number;
  commissionAmountCents: number;
  status: 'pending' | 'available' | 'paid' | 'reversed';
  availableAt?: string | null;
}) {
  const supabase = createRouteHandlerClient();

  const { data: existing } = await supabase
    .from('affiliate_commission_events')
    .select('id')
    .eq('stripe_event_id', params.stripeEventId)
    .single();

  if (existing) {
    return;
  }

  await supabase
    .from('affiliate_commission_events')
    .insert({
      affiliate_id: params.affiliateId,
      referred_user_id: params.referredUserId,
      stripe_event_id: params.stripeEventId,
      stripe_object_id: params.stripeObjectId,
      event_type: params.eventType,
      currency: params.currency,
      gross_amount_cents: params.grossAmountCents,
      commission_amount_cents: params.commissionAmountCents,
      status: params.status,
      available_at: params.availableAt || null,
    });
}

// ========================================
// WEBHOOK HANDLER
// ========================================

export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body for signature verification (CRITICAL: do NOT parse before verifying)
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      console.error('[Stripe Webhook] Missing stripe-signature header');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }

    // 2. Verify webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook secret not configured' },
        { status: 500 }
      );
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('[Stripe Webhook] Signature verification failed:', message);
      return NextResponse.json(
        { error: 'Signature verification failed' },
        { status: 401 }
      );
    }

    // 3. Check idempotency (prevent duplicate processing)
    const alreadyProcessed = await isEventProcessed(event.id);
    if (alreadyProcessed) {
      console.info('[Stripe Webhook] Event already processed:', event.id);
      return NextResponse.json({ received: true, cached: true }, { status: 200 });
    }

    // 4. Log incoming event
    const requestId = request.headers.get('stripe-request-id') || 'unknown';
    console.info('[Stripe Webhook] Event received', {
      eventId: event.id,
      eventType: event.type,
      mode: event.livemode ? 'live' : 'test',
      timestamp: new Date(event.created * 1000).toISOString(),
      requestId,
    });

    // 5. Handle event based on type
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutSessionCompleted(event);
          break;

        case 'invoice.payment_succeeded':
          await handleInvoicePaymentSucceeded(event);
          break;

        case 'customer.subscription.created':
          await handleSubscriptionCreated(event);
          break;

        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event);
          break;

        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event);
          break;

        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(event);
          break;

        case 'payment_intent.payment_failed':
          await handlePaymentIntentFailed(event);
          break;

        case 'charge.refunded':
          await handleChargeRefunded(event);
          break;

        case 'invoice.paid':
          await handleInvoicePaid(event);
          break;

        // Stripe Connect Events
        case 'account.updated':
          await handleAccountUpdated(event);
          break;

        case 'account.application.authorized':
          await handleAccountAuthorized(event);
          break;

        case 'application_fee.created':
          await handleApplicationFeeCreated(event);
          break;

        case 'application_fee.refunded':
          await handleApplicationFeeRefunded(event);
          break;

        default:
          // Log unhandled event types for awareness
          console.info('[Stripe Webhook] Unhandled event type:', event.type);
      }

      // Mark event as processed (idempotency)
      await markEventProcessed(event.id);

    } catch (handlerError) {
      console.error('[Stripe Webhook] Error handling event:', {
        eventId: event.id,
        eventType: event.type,
        error: handlerError instanceof Error ? handlerError.message : 'Unknown error',
        stack: handlerError instanceof Error ? handlerError.stack : undefined,
      });
      // Still return 200 - we don't want Stripe to retry
      // Error is logged for manual investigation
    }

    // 5. Return success immediately (processing happens async in handlers)
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('[Stripe Webhook] Unexpected error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Return 500 only for unexpected errors - Stripe will retry
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// ========================================
// EVENT HANDLERS
// ========================================

async function handleCheckoutSessionCompleted(event: Stripe.Event) {
  const session = event.data.object as Stripe.Checkout.Session;
  console.info('[Stripe Webhook] Processing checkout.session.completed', {
    sessionId: session.id,
    customerId: session.customer,
    paymentStatus: session.payment_status,
    amountTotal: session.amount_total,
    currency: session.currency,
  });

  try {
    // For subscription checkout sessions
    if (session.mode === 'subscription' && session.subscription) {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string,
        { expand: ['customer'] }
      );

      const userId = session.metadata?.user_id;
      if (!userId) {
        console.error('[Webhook] No user_id in session metadata');
        return;
      }

      // Store customer mapping
      await storeCustomerMapping(userId, session.customer as string);

      // Upsert subscription to database
      await upsertSubscription(subscription, userId);

      // Trigger finance aggregation
      const supabase = createRouteHandlerClient();
      await recomputeFinanceDailyAggregates(supabase, {
        start: new Date(),
        end: new Date(),
      });

      console.info('[Webhook] Subscription created from checkout:', {
        userId,
        subscriptionId: subscription.id,
        status: subscription.status,
      });
    }

    // For one-time payment sessions
    if (session.mode === 'payment') {
      // Handle one-time payment completion
      console.info('[Webhook] One-time payment completed:', session.id);

      const userId = session.metadata?.user_id || (session.customer
        ? await getUserIdFromCustomerId(session.customer as string)
        : null);

      if (!userId || !session.amount_total) {
        return;
      }

      const affiliate = await getAffiliateForUser(userId);
      if (!affiliate) {
        return;
      }

      const commissionAmount = Math.round(
        session.amount_total * (affiliate.commissionPercent / 100)
      );

      const availableAt = new Date(
        Date.now() + AFFILIATE_PAYOUT_DELAY_DAYS * 24 * 60 * 60 * 1000
      ).toISOString();

      await insertCommissionEvent({
        affiliateId: affiliate.affiliateId,
        referredUserId: userId,
        stripeEventId: event.id,
        stripeObjectId: session.id,
        eventType: event.type,
        currency: session.currency || 'usd',
        grossAmountCents: session.amount_total,
        commissionAmountCents: commissionAmount,
        status: 'pending',
        availableAt,
      });
    }
  } catch (error) {
    console.error('[Webhook] Error handling checkout.session.completed:', error);
    throw error;
  }
}

async function handleInvoicePaymentSucceeded(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const invoiceSubscription = (invoice as Stripe.Invoice & { subscription?: string | null }).subscription;
  console.info('[Stripe Webhook] Processing invoice.payment_succeeded', {
    invoiceId: invoice.id,
    subscriptionId: invoiceSubscription,
    amountPaid: invoice.amount_paid,
  });

  try {
    if (invoiceSubscription) {
      const stripe = getStripe();
      const subscription = await stripe.subscriptions.retrieve(
        invoiceSubscription
      );

      // Get user ID from customer ID
      const userId = await getUserIdFromCustomerId(subscription.customer as string);
      if (!userId) {
        console.error('[Webhook] Could not find user for customer:', subscription.customer);
        return;
      }

      // Update subscription in database
      await upsertSubscription(subscription, userId);

      console.info('[Webhook] Subscription updated from invoice payment:', {
        userId,
        subscriptionId: subscription.id,
        status: subscription.status,
      });
    }
  } catch (error) {
    console.error('[Webhook] Error handling invoice.payment_succeeded:', error);
    throw error;
  }
}

async function handleSubscriptionCreated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  console.info('[Stripe Webhook] Processing customer.subscription.created', {
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status,
  });

  try {
    const userId = await getUserIdFromCustomerId(subscription.customer as string);
    if (!userId) {
      console.error('[Webhook] Could not find user for customer:', subscription.customer);
      return;
    }

    await upsertSubscription(subscription, userId);

    console.info('[Webhook] Subscription created:', {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (error) {
    console.error('[Webhook] Error handling subscription.created:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  console.info('[Stripe Webhook] Processing customer.subscription.updated', {
    subscriptionId: subscription.id,
    status: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });

  try {
    const userId = await getUserIdFromCustomerId(subscription.customer as string);
    if (!userId) {
      console.error('[Webhook] Could not find user for customer:', subscription.customer);
      return;
    }

    await upsertSubscription(subscription, userId);

    console.info('[Webhook] Subscription updated:', {
      userId,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (error) {
    console.error('[Webhook] Error handling subscription.updated:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(event: Stripe.Event) {
  const subscription = event.data.object as Stripe.Subscription;
  console.info('[Stripe Webhook] Processing customer.subscription.deleted', {
    subscriptionId: subscription.id,
  });

  try {
    await updateSubscriptionStatus(subscription.id, 'canceled');

    console.info('[Webhook] Subscription marked as canceled:', {
      subscriptionId: subscription.id,
    });
  } catch (error) {
    console.error('[Webhook] Error handling subscription.deleted:', error);
    throw error;
  }
}

async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const paymentIntentInvoice = (paymentIntent as Stripe.PaymentIntent & { invoice?: string | null }).invoice;
  console.info('[Stripe Webhook] Processing payment_intent.succeeded', {
    paymentIntentId: paymentIntent.id,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    metadata: paymentIntent.metadata,
  });

  // For one-time payments (not subscriptions)
  // Subscriptions are handled via invoice events
  if (!paymentIntentInvoice) {
    console.info('[Webhook] One-time payment intent succeeded:', paymentIntent.id);
    
    // PHASE 12: Trigger automated fulfillment
    const orderId = paymentIntent.metadata?.orderId;
    if (orderId) {
      try {
        const supabase = createRouteHandlerClient();
        
        // Get order details
        const { data: order } = await supabase
          .from('orders')
          .select('*, order_items(product_id, quantity)')
          .eq('id', orderId)
          .single();
        
        if (order && order.order_items) {
          // Trigger fulfillment via API
          const fulfillmentResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/fulfillment`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({
              orderId: order.id,
              storeId: order.store_id || order.seller_user_id,
              items: order.order_items,
            }),
          });
          
          if (!fulfillmentResponse.ok) {
            console.error('[Webhook] Failed to trigger fulfillment:', await fulfillmentResponse.text());
          } else {
            console.info('[Webhook] Fulfillment triggered for order:', orderId);
          }
        }
      } catch (fulfillmentError) {
        console.error('[Webhook] Error triggering fulfillment:', fulfillmentError);
        // Don't throw - fulfillment can be retried manually
      }
    }
  }
}

async function handlePaymentIntentFailed(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  console.error('[Stripe Webhook] Processing payment_intent.payment_failed', {
    paymentIntentId: paymentIntent.id,
    lastPaymentError: paymentIntent.last_payment_error?.message,
  });

  // TODO: Notify user of payment failure
  console.error('[Webhook] Payment failed:', {
    paymentIntentId: paymentIntent.id,
    error: paymentIntent.last_payment_error,
  });
}

async function handleChargeRefunded(event: Stripe.Event) {
  const charge = event.data.object as Stripe.Charge;
  console.info('[Stripe Webhook] Processing charge.refunded', {
    chargeId: charge.id,
    refunded: charge.refunded,
    refundedAmount: charge.amount_refunded,
  });

  const customerId = charge.customer as string | null;
  const userId = customerId ? await getUserIdFromCustomerId(customerId) : null;

  if (!userId || !charge.amount_refunded) {
    return;
  }

  const affiliate = await getAffiliateForUser(userId);
  if (!affiliate) {
    return;
  }

  const commissionAmount = Math.round(
    charge.amount_refunded * (affiliate.commissionPercent / 100)
  );

  await insertCommissionEvent({
    affiliateId: affiliate.affiliateId,
    referredUserId: userId,
    stripeEventId: event.id,
    stripeObjectId: charge.payment_intent as string || charge.id,
    eventType: event.type,
    currency: charge.currency || 'usd',
    grossAmountCents: -charge.amount_refunded,
    commissionAmountCents: -commissionAmount,
    status: 'reversed',
  });
}

async function handleInvoicePaid(event: Stripe.Event) {
  const invoice = event.data.object as Stripe.Invoice;
  const invoiceSubscription = (invoice as Stripe.Invoice & { subscription?: string | null }).subscription;
  console.info('[Stripe Webhook] Processing invoice.paid', {
    invoiceId: invoice.id,
    subscriptionId: invoiceSubscription,
    amountPaid: invoice.amount_paid,
  });

  const userId = invoice.customer
    ? await getUserIdFromCustomerId(invoice.customer as string)
    : null;

  if (!userId) {
    console.error('[Webhook] Could not resolve user for invoice:', invoice.id);
    return;
  }

  if (!invoice.amount_paid) {
    return;
  }

  const affiliate = await getAffiliateForUser(userId);
  if (!affiliate) {
    return;
  }

  const commissionAmount = Math.round(
    invoice.amount_paid * (affiliate.commissionPercent / 100)
  );

  const availableAt = new Date(
    Date.now() + AFFILIATE_PAYOUT_DELAY_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await insertCommissionEvent({
    affiliateId: affiliate.affiliateId,
    referredUserId: userId,
    stripeEventId: event.id,
    stripeObjectId: invoice.id,
    eventType: event.type,
    currency: invoice.currency || 'usd',
    grossAmountCents: invoice.amount_paid,
    commissionAmountCents: commissionAmount,
    status: 'pending',
    availableAt,
  });

  // Trigger finance aggregation
  const supabase = createRouteHandlerClient();
  await recomputeFinanceDailyAggregates(supabase, {
    start: new Date(),
    end: new Date(),
  });
}

// ========================================
// STRIPE CONNECT EVENT HANDLERS
// ========================================

async function handleAccountUpdated(event: Stripe.Event) {
  const account = event.data.object as Stripe.Account;
  console.info('[Stripe Webhook] Processing account.updated', {
    accountId: account.id,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
  });

  try {
    // Get user ID from account metadata
    const userId = account.metadata?.user_id;
    if (!userId) {
      // Fallback: Look up user_id from database
      const supabase = createRouteHandlerClient();
      const { data } = await supabase
        .from('seller_profiles')
        .select('user_id')
        .eq('stripe_connected_account_id', account.id)
        .single();

      if (!data) {
        console.warn('[Webhook] No user found for account:', account.id);
        return;
      }

      await updateAccountStatus(data.user_id, account.id);
    } else {
      await updateAccountStatus(userId, account.id);
    }

    console.info('[Webhook] Account status updated:', {
      accountId: account.id,
      userId,
    });
  } catch (error) {
    console.error('[Webhook] Error handling account.updated:', error);
    throw error;
  }
}

async function handleAccountAuthorized(event: Stripe.Event) {
  const authorization = event.data.object as { account?: string };
  console.info('[Stripe Webhook] Processing account.application.authorized', {
    accountId: authorization.account || null,
  });

  // Seller has authorized the platform to access their account
  // Standard accounts don't need this, but log for audit
  console.info('[Webhook] Account authorized:', authorization.account || null);
}

async function handleApplicationFeeCreated(event: Stripe.Event) {
  const applicationFee = event.data.object as Stripe.ApplicationFee;
  console.info('[Stripe Webhook] Processing application_fee.created', {
    feeId: applicationFee.id,
    amount: applicationFee.amount,
    chargeId: applicationFee.charge,
  });

  try {
    // Find the payment intent associated with this fee
    const stripe = getStripe();
    const charge = await stripe.charges.retrieve(applicationFee.charge as string);
    
    if (charge.payment_intent) {
      await updateCommissionStatus(charge.payment_intent as string, 'collected');
      console.info('[Webhook] Commission marked as collected:', {
        paymentIntentId: charge.payment_intent,
        feeAmount: applicationFee.amount,
      });
    }
  } catch (error) {
    console.error('[Webhook] Error handling application_fee.created:', error);
    throw error;
  }
}

async function handleApplicationFeeRefunded(event: Stripe.Event) {
  const applicationFee = event.data.object as Stripe.ApplicationFee;
  console.info('[Stripe Webhook] Processing application_fee.refunded', {
    feeId: applicationFee.id,
    refunded: applicationFee.refunded,
    refundedAmount: applicationFee.amount_refunded,
  });

  try {
    // Update commission status to refunded
    const stripe = getStripe();
    const charge = await stripe.charges.retrieve(applicationFee.charge as string);
    
    if (charge.payment_intent) {
      await updateCommissionStatus(charge.payment_intent as string, 'refunded');
      console.info('[Webhook] Commission marked as refunded:', {
        paymentIntentId: charge.payment_intent,
      });
    }
  } catch (error) {
    console.error('[Webhook] Error handling application_fee.refunded:', error);
    throw error;
  }
}

// ========================================
// GET endpoint not allowed
// ========================================

export async function GET(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
