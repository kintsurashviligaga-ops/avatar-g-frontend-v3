/**
 * POST /api/stripe/subscription/create-checkout
 * 
 * Create Stripe checkout session for subscription
 * 
 * Security:
 * - Requires authenticated user
 * - Prevents duplicate active subscriptions
 * - Creates or reuses Stripe customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getStripe } from '@/lib/billing/stripe';
import { getPriceId, isValidPriceId, SUBSCRIPTION_CONFIG, type SubscriptionPlan, type BillingInterval } from '@/lib/stripe/plans';
import { 
  hasActiveSubscription, 
  getCustomerIdForUser, 
  storeCustomerMapping 
} from '@/lib/stripe/subscriptions';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

interface CreateCheckoutRequest {
  priceId?: string;
  customerEmail?: string;
  plan?: SubscriptionPlan;
  interval?: BillingInterval;
  idempotencyKey?: string;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body: CreateCheckoutRequest = await request.json();
    const { priceId, plan, interval, customerEmail, idempotencyKey } = body;

    // 3. Resolve price ID
    let resolvedPriceId = priceId || null;
    if (!resolvedPriceId && plan && interval) {
      resolvedPriceId = getPriceId(plan, interval);
    }

    if (!resolvedPriceId || !isValidPriceId(resolvedPriceId)) {
      return NextResponse.json(
        { error: 'Invalid or missing priceId' },
        { status: 400 }
      );
    }

    // 4. Check for existing active subscription
    const hasActiveSub = await hasActiveSubscription(user.id);
    if (hasActiveSub) {
      return NextResponse.json(
        { error: 'You already have an active subscription. Please manage it from the customer portal.' },
        { status: 409 }
      );
    }

    // 5. Get or create Stripe customer
    const stripe = getStripe();
    let customerId = await getCustomerIdForUser(user.id);

    if (!customerId) {
      // Create new Stripe customer
      const email = user.email || customerEmail || undefined;
      const customer = await stripe.customers.create({
        email,
        metadata: {
          user_id: user.id,
        },
      });
      customerId = customer.id;
      
      // Store customer ID mapping
      await storeCustomerMapping(user.id, customerId);
      
      console.log('[Stripe] Created new customer:', {
        userId: user.id,
        customerId,
      });
    }

    // 6. Create checkout session
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const baseKey = idempotencyKey || request.headers.get('Idempotency-Key') || `${user.id}:${resolvedPriceId}`;
    const hashedKey = createHash('sha256').update(baseKey).digest('hex');

    const subscriptionData = SUBSCRIPTION_CONFIG.trialDays > 0
      ? {
          trial_period_days: SUBSCRIPTION_CONFIG.trialDays,
          metadata: {
            user_id: user.id,
          },
        }
      : {
          metadata: {
            user_id: user.id,
          },
        };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: resolvedPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pay/cancel`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      metadata: {
        user_id: user.id,
        plan: plan || 'custom',
        interval: interval || 'custom',
      },
      subscription_data: subscriptionData,
    }, { idempotencyKey: hashedKey });

    console.log('[Stripe] Checkout session created:', {
      sessionId: session.id,
      userId: user.id,
      plan: plan || 'custom',
      interval: interval || 'custom',
    });

    // 7. Return session URL
    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });

  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Only POST allowed
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
