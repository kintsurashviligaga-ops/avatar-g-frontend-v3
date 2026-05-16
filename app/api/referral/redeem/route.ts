/**
 * POST /api/referral/redeem
 * Redeem a referral code at signup. Called after user confirms email.
 * Body: { code: string }
 * Awards 50 credits to new user + 50 credits to referrer.
 * One redemption per user — idempotent.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NEW_USER_BONUS = 50;    // credits awarded to the new user
const REFERRER_BONUS = 50;    // credits awarded to the referrer

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabase = createServiceRoleClient();

    const body = await request.json() as { code?: string };
    const code = (body.code ?? '').trim().toUpperCase();

    if (!code || code.length < 6) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    }

    // Check current user hasn't already redeemed a code
    const { data: selfProfile } = await supabase
      .from('profiles')
      .select('referral_redeemed, referral_code')
      .eq('id', user.id)
      .maybeSingle();

    if (selfProfile?.referral_redeemed) {
      return NextResponse.json({ error: 'Already redeemed a referral code', alreadyRedeemed: true }, { status: 409 });
    }

    // Find referrer by code
    const { data: referrer } = await supabase
      .from('profiles')
      .select('id, referral_count, referral_credits_earned')
      .eq('referral_code', code)
      .maybeSingle();

    if (!referrer) {
      return NextResponse.json({ error: 'Referral code not found' }, { status: 404 });
    }

    if (referrer.id === user.id) {
      return NextResponse.json({ error: 'Cannot use your own referral code' }, { status: 400 });
    }

    // Award credits to new user
    try { await supabase.rpc('add_credits', { p_user_id: user.id, p_amount: NEW_USER_BONUS }); } catch { /* graceful */ }

    // Mark as redeemed on new user profile
    await supabase
      .from('profiles')
      .update({ referral_redeemed: true, referral_used_code: code })
      .eq('id', user.id);

    // Award credits to referrer + increment referral count
    await supabase
      .from('profiles')
      .update({
        referral_count: (referrer.referral_count ?? 0) + 1,
        referral_credits_earned: (referrer.referral_credits_earned ?? 0) + REFERRER_BONUS,
      })
      .eq('id', referrer.id);

    // Try to add credits to referrer's credits table too
    try { await supabase.rpc('add_credits', { p_user_id: referrer.id, p_amount: REFERRER_BONUS }); } catch { /* graceful */ }

    return NextResponse.json({
      success: true,
      bonusCredits: NEW_USER_BONUS,
      message: `🎉 ${NEW_USER_BONUS} კრედიტი დამატებულია თქვენს ანგარიშზე!`,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Referral redeem error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
