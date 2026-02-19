/**
 * GET /api/stripe/connect/status
 * 
 * Returns Stripe Connect account status for the authenticated user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: accountRow } = await supabase
      .from('stripe_connect_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!accountRow?.stripe_account_id) {
      return NextResponse.json({
        connected: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
        requirements: {
          currentlyDue: [],
          eventuallyDue: [],
          pastDue: [],
        },
        accountId: null,
      });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(accountRow.stripe_account_id);

    const chargesEnabled = account.charges_enabled ?? false;
    const payoutsEnabled = account.payouts_enabled ?? false;
    const detailsSubmitted = account.details_submitted ?? false;
    const connected = detailsSubmitted;

    const requirements = {
      currentlyDue: account.requirements?.currently_due ?? [],
      eventuallyDue: account.requirements?.eventually_due ?? [],
      pastDue: account.requirements?.past_due ?? [],
    };

    await supabase
      .from('stripe_connect_accounts')
      .update({
        connected,
        charges_enabled: chargesEnabled,
        payouts_enabled: payoutsEnabled,
        details_submitted: detailsSubmitted,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    return NextResponse.json({
      connected,
      chargesEnabled,
      payoutsEnabled,
      detailsSubmitted,
      requirements,
      accountId: accountRow.stripe_account_id,
    });
  } catch (error) {
    console.error('[Connect] Error fetching status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch status' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
