/**
 * POST /api/stripe/connect/create-account
 * 
 * Creates a Stripe Connect Standard account for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: existing } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (existing?.stripe_account_id) {
      return NextResponse.json({ accountId: existing.stripe_account_id });
    }

    const body = await request.json().catch(() => ({}));
    const businessName = body?.businessName as string | undefined;

    const stripe = getStripe();
    const account = await stripe.accounts.create({
      type: 'standard',
      email: user.email || undefined,
      business_type: 'individual',
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      metadata: {
        user_id: user.id,
        business_name: businessName || '',
        platform: 'avatar-g',
      },
    });

    const { error: insertError } = await supabase
      .from('stripe_connect_accounts')
      .insert({
        user_id: user.id,
        stripe_account_id: account.id,
        connected: false,
        charges_enabled: account.charges_enabled ?? false,
        payouts_enabled: account.payouts_enabled ?? false,
        details_submitted: account.details_submitted ?? false,
      });

    if (insertError) {
      console.error('[Connect] Failed to store account:', insertError);
      return NextResponse.json({ error: 'Failed to store account' }, { status: 500 });
    }

    return NextResponse.json({ accountId: account.id });
  } catch (error) {
    console.error('[Connect] Error creating account:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
