/**
 * POST /api/referral/create
 * Generate or retrieve a user's personal referral code.
 * Stores in profiles.referral_code (adds 'ref_' prefix + 8-char hex).
 * Returns: { code, shareUrl, totalReferrals, creditsEarned }
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const REFERRAL_REWARD_CREDITS = 50; // credits awarded to referrer per successful signup
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://myavatar.ge';

function generateCode(userId: string): string {
  // Deterministic-ish code from user ID suffix + random suffix
  const seed = userId.replace(/-/g, '').slice(-6);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${seed}${rand}`.toUpperCase().slice(0, 8);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabase = createServiceRoleClient();

    // Check if user already has a referral code
    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code, referral_count, referral_credits_earned')
      .eq('id', user.id)
      .maybeSingle();

    let code = profile?.referral_code as string | null;

    if (!code) {
      code = `AG${generateCode(user.id)}`;
      // Try to save it — may fail if column doesn't exist yet (graceful degradation)
      await supabase
        .from('profiles')
        .update({ referral_code: code })
        .eq('id', user.id);
    }

    const shareUrl = `${BASE_URL}/signup?ref=${code}`;

    return NextResponse.json({
      code,
      shareUrl,
      totalReferrals: profile?.referral_count ?? 0,
      creditsEarned: profile?.referral_credits_earned ?? 0,
      rewardPerReferral: REFERRAL_REWARD_CREDITS,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Referral create error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
