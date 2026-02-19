/**
 * GET /api/stripe/subscription/get-status
 * 
 * Get current user's subscription status
 * 
 * Security:
 * - Requires authenticated user
 * - Returns only user's own subscription
 */

import { NextRequest, NextResponse } from 'next/server';
import { getUserSubscription } from '@/lib/stripe/subscriptions';
import { getPlanFromPriceId } from '@/lib/stripe/plans';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // 2. Get subscription from database
    const subscription = await getUserSubscription(user.id);

    if (!subscription) {
      return NextResponse.json({
        hasSubscription: false,
        status: 'none',
        priceId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: null,
        subscription: null,
      });
    }

    // 3. Determine plan name from price ID
    const planName = getPlanFromPriceId(subscription.stripe_price_id);

    // 4. Return subscription status
    return NextResponse.json({
      hasSubscription: true,
      status: subscription.status,
      priceId: subscription.stripe_price_id,
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      subscription: {
        id: subscription.id,
        plan: planName,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        priceId: subscription.stripe_price_id,
      },
    });

  } catch (error) {
    console.error('[Stripe] Error fetching subscription status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to fetch subscription status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Only GET allowed
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET.' },
    { status: 405 }
  );
}
