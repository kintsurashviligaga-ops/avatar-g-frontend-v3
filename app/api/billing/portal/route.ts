/**
 * POST /api/billing/portal
 * Create Stripe customer portal session for subscription management
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createPortalSession } from '@/lib/billing/stripe';

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
    
    // Get subscription with customer ID
    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();
    
    if (subError || !subscription || !subscription.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No subscription found' },
        { status: 404 }
      );
    }
    
    // Skip temp customer IDs
    if (subscription.stripe_customer_id.startsWith('temp_')) {
      return NextResponse.json(
        { error: 'Please complete checkout first' },
        { status: 400 }
      );
    }
    
    // Create portal session
    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const portalUrl = await createPortalSession({
      customerId: subscription.stripe_customer_id,
      returnUrl: `${origin}/dashboard`,
    });
    
    return NextResponse.json({ url: portalUrl });
    
  } catch (error) {
    console.error('Portal error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create portal session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
