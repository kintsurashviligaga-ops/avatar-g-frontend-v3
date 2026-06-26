/**
 * GET /api/credits/balance
 * Get user's current credit balance and allowance
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabase = createRouteHandlerClient();

    await supabase.rpc('reset_user_credits_if_due', { p_user_id: user.id });

    // BALANCE OF RECORD = profiles.credits_balance — the GEL wallet the spend saga
    // (deduct_credits) draws from AND the Stripe top-up webhook (credit_wallet_gel)
    // credits. The legacy `credits` table now only carries the monthly subscription
    // allowance, so read the wallet from profiles (falling back to credits.balance for
    // any profile row not yet backfilled). This is why a paid top-up + in-app spends
    // now reflect in the top-bar ₾ chip.
    const [{ data: prof }, { data: credits }] = await Promise.all([
      supabase.from('profiles').select('credits_balance').eq('id', user.id).maybeSingle(),
      supabase.from('credits').select('balance, monthly_allowance, reset_at').eq('user_id', user.id).maybeSingle(),
    ]);

    const balance = typeof prof?.credits_balance === 'number'
      ? prof.credits_balance
      : (typeof credits?.balance === 'number' ? credits.balance : 0);

    // PHASE 4 Task 5D — 10s private cache. Safe because the correctness-critical
    // refetches (post-topup poll, post-generation toast) call this with cache:'no-store'
    // and bypass it; this only spares redundant background reads.
    return NextResponse.json({
      balance,
      monthlyAllowance: credits?.monthly_allowance ?? null,
      resetAt: credits?.reset_at ?? null,
    }, { headers: { 'Cache-Control': 'private, max-age=10' } });

  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.error('Credits API error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch credits',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
