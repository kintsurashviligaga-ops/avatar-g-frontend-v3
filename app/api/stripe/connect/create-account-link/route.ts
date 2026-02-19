/**
 * POST /api/stripe/connect/create-account-link
 * 
 * Creates a Stripe Connect onboarding link for the authenticated user.
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

    const body = await request.json().catch(() => ({}));
    const providedAccountId = body?.accountId as string | undefined;

    let accountId = providedAccountId;
    if (!accountId) {
      const { data: existing } = await supabase
        .from('stripe_connect_accounts')
        .select('stripe_account_id')
        .eq('user_id', user.id)
        .single();

      accountId = existing?.stripe_account_id || null;
    }

    if (!accountId) {
      return NextResponse.json({ error: 'No Connect account found' }, { status: 404 });
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/sell/onboarding`,
      return_url: `${appUrl}/sell/onboarding`,
      type: 'account_onboarding',
    });

    return NextResponse.json({ url: link.url });
  } catch (error) {
    console.error('[Connect] Error creating account link:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create account link' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
