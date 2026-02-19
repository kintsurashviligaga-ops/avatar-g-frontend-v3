/**
 * POST /api/stripe/connect/login-link
 * 
 * Creates a Stripe Connect login link for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: accountRow } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id')
      .eq('user_id', user.id)
      .single();

    if (!accountRow?.stripe_account_id) {
      return NextResponse.json({ error: 'No Connect account found' }, { status: 404 });
    }

    const stripe = getStripe();
    const loginLink = await stripe.accounts.createLoginLink(accountRow.stripe_account_id);

    return NextResponse.json({ url: loginLink.url });
  } catch (error) {
    console.error('[Connect] Error creating login link:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create login link' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
