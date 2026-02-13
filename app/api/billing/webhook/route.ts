/**
 * POST /api/billing/webhook
 * Stripe webhook handler for subscription events
 * IMPORTANT: Must handle raw body for signature verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import Stripe from 'stripe';
import { verifyWebhookSignature } from '@/lib/billing/stripe';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPlanByStripePriceId } from '@/lib/billing/stripe-prices';

export const dynamic = 'force-dynamic';

// Disable body parsing to get raw body
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    // Get raw body
    const body = await request.text();
    const signature = headers().get('stripe-signature');
    
    if (!signature) {
      console.error('Missing Stripe signature');
      return NextResponse.json(
        { error: 'Missing signature' },
        { status: 400 }
      );
    }
    
    // Verify webhook signature
    let event: Stripe.Event;
    try {
      event = verifyWebhookSignature(body, signature);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      );
    }
    
    console.log(`Webhook received: ${event.type} (${event.id})`);
    
    // IDEMPOTENCY CHECK: Return success if already processed
    const supabase = createSupabaseServerClient();
    const { data: existingEvent } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('stripe_event_id', event.id)
      .single();
    
    if (existingEvent) {
      console.log(`Event ${event.id} already processed, skipping`);
      return NextResponse.json({ received: true, cached: true });
    }
    
    // Process event
    let processSuccess = true;
    let errorMessage: string | null = null;
    
    try {
      switch (event.type) {
        case 'checkout.session.completed':
          await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
          break;
        
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;
        
        case 'customer.subscription.deleted':
          await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;
        
        case 'invoice.paid':
        case 'invoice.payment_succeeded':
          await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;
        
        case 'invoice.payment_failed':
          await handlePaymentFailed(event.data.object as Stripe.Invoice);
          break;
        
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      processSuccess = false;
      errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Event processing error:`, error);
    }
    
    // RECORD EVENT (Idempotency)
    await supabase.from('stripe_events').upsert({
      stripe_event_id: event.id,
      event_type: event.type,
      event_data: event.data.object as unknown as Record<string, unknown>,
      success: processSuccess,
      error_message: errorMessage,
    }, { onConflict: 'stripe_event_id' });
    
    if (!processSuccess) {
      return NextResponse.json(
        { error: 'Event processing failed', message: errorMessage },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ received: true });
    
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { 
        error: 'Webhook handler failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Handle successful checkout
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const supabase = createSupabaseServerClient();
  
  const customerId = session.customer as string;
  const subscriptionId = session.subscription as string;
  
  if (!customerId || !subscriptionId) {
    console.error('Missing customer or subscription in checkout session');
    return;
  }
  
  // Get subscription to find user
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  
  if (!subscription) {
    console.error(`No subscription found for customer: ${customerId}`);
    return;
  }
  
  const userId = subscription.user_id;
  
  console.log(`Checkout completed for user: ${userId}`);
  
  // Subscription details will be updated via subscription.created/updated event
}

/**
 * Handle subscription created/updated
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const supabase = createSupabaseServerClient();
  type SubscriptionWithPeriod = Stripe.Subscription & {
    current_period_end?: number;
    current_period_start?: number;
  };
  const periodSubscription = subscription as SubscriptionWithPeriod;
  
  const customerId = subscription.customer as string;
  const subscriptionId = subscription.id;
  const status = subscription.status;
  const currentPeriodEnd = periodSubscription.current_period_end ? new Date(periodSubscription.current_period_end * 1000) : new Date();
  const currentPeriodStart = periodSubscription.current_period_start ? new Date(periodSubscription.current_period_start * 1000) : new Date();
  const cancelAtPeriodEnd = subscription.cancel_at_period_end || false;
  
  // Determine plan from price ID
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? getPlanByStripePriceId(priceId) : null;
  
  if (!plan) {
    console.error(`Could not determine plan for price ID: ${priceId}`);
    return;
  }
  
  // Get user ID from subscription
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  
  if (!existingSub) {
    console.error(`No user found for customer: ${customerId}`);
    return;
  }
  
  const userId = existingSub.user_id;
  
  // Update subscription
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      stripe_subscription_id: subscriptionId,
      plan,
      status,
      current_period_start: currentPeriodStart.toISOString(),
      current_period_end: currentPeriodEnd.toISOString(),
      cancel_at_period_end: cancelAtPeriodEnd,
      canceled_at: subscription.canceled_at 
        ? new Date(subscription.canceled_at * 1000).toISOString() 
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  
  if (updateError) {
    console.error('Failed to update subscription:', updateError);
    return;
  }
  
  // Update monthly allowance using database function
  try {
    const { data: allowanceResult, error: allowanceError } = await supabase
      .rpc('update_monthly_allowance', {
        p_user_id: userId,
        p_plan: plan
      });
    
    if (allowanceError) {
      console.error('Failed to update monthly allowance:', allowanceError);
    } else {
      console.log(`Updated allowance for user ${userId} to plan ${plan}:`, allowanceResult);
    }
  } catch (error) {
    console.error('Failed to update monthly allowance:', error);
  }
  
  console.log(`Subscription updated: ${userId} -> ${plan} (${status})`);
}

/**
 * Handle subscription deleted/canceled
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const supabase = createSupabaseServerClient();
  
  const customerId = subscription.customer as string;
  
  // Get user ID
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  
  if (!existingSub) {
    console.error(`No user found for customer: ${customerId}`);
    return;
  }
  
  const userId = existingSub.user_id;
  
  // Downgrade to FREE plan
  const { error: updateError } = await supabase
    .from('subscriptions')
    .update({
      plan: 'FREE',
      status: 'canceled',
      stripe_subscription_id: null,
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  
  if (updateError) {
    console.error('Failed to downgrade subscription:', updateError);
    return;
  }
  
  // Update monthly allowance to FREE plan using database function
  try {
    await supabase.rpc('update_monthly_allowance', {
      p_user_id: userId,
      p_plan: 'FREE'
    });
    console.log(`Downgraded user ${userId} to FREE plan`);
  } catch (error) {
    console.error('Failed to update monthly allowance:', error);
  }
}

/**
 * Handle successful payment (refill credits if needed)
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice) {
  const supabase = createSupabaseServerClient();
  
  const customerId = invoice.customer as string;
  
  // Get user ID
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('user_id, plan')
    .eq('stripe_customer_id', customerId)
    .single();
  
  if (!subscription) {
    console.error(`No subscription found for customer: ${customerId}`);
    return;
  }
  
  console.log(`Payment succeeded for user: ${subscription.user_id}`);
  
  // Refresh monthly allowance on successful payment
  try {
    await supabase.rpc('update_monthly_allowance', {
      p_user_id: subscription.user_id,
      p_plan: subscription.plan,
    });
  } catch (error) {
    console.error('Failed to refresh monthly allowance:', error);
  }
  
  // Ensure subscription is active after successful payment
  await supabase
    .from('subscriptions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('user_id', subscription.user_id);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const supabase = createSupabaseServerClient();
  
  const customerId = invoice.customer as string;
  
  // Get user ID
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();
  
  if (!subscription) {
    console.error(`No subscription found for customer: ${customerId}`);
    return;
  }
  
  const userId = subscription.user_id;
  
  // Update subscription status
  await supabase
    .from('subscriptions')
    .update({
      status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
  
  console.log(`Payment failed for user: ${userId}`);
  
  // TODO: Send notification email to user
}
