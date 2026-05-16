/**
 * GET /api/referral/status
 * Returns the current user's referral code, stats, and share URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://myavatar.ge';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const supabase = createServiceRoleClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('referral_code, referral_count, referral_credits_earned, referral_redeemed, referral_used_code')
      .eq('id', user.id)
      .maybeSingle();

    const code = profile?.referral_code as string | null;
    const shareUrl = code ? `${BASE_URL}/signup?ref=${code}` : null;

    return NextResponse.json({
      code,
      shareUrl,
      totalReferrals: profile?.referral_count ?? 0,
      creditsEarned: profile?.referral_credits_earned ?? 0,
      hasRedeemed: profile?.referral_redeemed ?? false,
      usedCode: profile?.referral_used_code ?? null,
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
