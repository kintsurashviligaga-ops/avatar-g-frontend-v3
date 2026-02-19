/**
 * POST /api/stripe/customer-portal
 * 
 * Create Stripe customer portal session
 * Allows users to manage subscriptions, payment methods, invoices
 * 
 * Security:
 * - Requires authenticated user
 * - Requires existing Stripe customer
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe';
import { getCustomerIdForUser } from '@/lib/stripe/subscriptions';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
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

    // 2. Get Stripe customer ID
    const customerId = await getCustomerIdForUser(user.id);

    if (!customerId) {
      return NextResponse.json(
        { error: 'No Stripe customer found. Please subscribe first.' },
        { status: 404 }
      );
    }

    // 3. Create portal session
    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/account/billing`,
    });

    console.log('[Stripe] Customer portal session created:', {
      userId: user.id,
      customerId,
      sessionId: session.id,
    });

    // 4. Return portal URL
    return NextResponse.json({
      url: session.url,
    });

  } catch (error) {
    console.error('[Stripe] Error creating customer portal session:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to create customer portal session',
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
