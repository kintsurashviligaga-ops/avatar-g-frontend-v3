/**
 * POST /api/billing/checkout
 * Create Stripe checkout session for subscription upgrade
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createCheckoutSession, getOrCreateCustomer } from '@/lib/billing/stripe';
import { getPlan, normalizePlanTier } from '@/lib/billing/plans';
import { getStripePriceId } from '@/lib/billing/stripe-prices';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse request
    const body = await request.json();
    const { plan } = body;
    
    // Validate plan
    if (!plan) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      );
    }

    const normalizedPlan = normalizePlanTier(plan);
    const priceId = getStripePriceId(normalizedPlan);

    if (!priceId) {
      return NextResponse.json(
        { error: 'Plan does not require payment' },
        { status: 400 }
      );
    }
    
    // Get or create subscription record
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    
    let customerId = subscription?.stripe_customer_id;
    
    // Create Stripe customer if needed
    if (!customerId || customerId.startsWith('temp_')) {
      customerId = await getOrCreateCustomer({
        userId: user.id,
        email: user.email || '',
        name: user.user_metadata?.full_name,
      });
      
      // Update subscription record
      await supabase
        .from('subscriptions')
        .upsert({
          user_id: user.id,
          stripe_customer_id: customerId,
          plan: 'FREE',
          status: 'active',
        });
    }
    
    // Create checkout session
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const checkoutUrl = await createCheckoutSession({
      customerId,
      priceId,
      successUrl: `${origin}/dashboard?checkout=success`,
      cancelUrl: `${origin}/dashboard?checkout=canceled`,
    });
    
    return NextResponse.json({ url: checkoutUrl });
    
  } catch (error) {
    console.error('Checkout error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
