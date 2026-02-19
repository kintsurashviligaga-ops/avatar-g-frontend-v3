/**
 * POST /api/affiliate/claim
 * Claims referral for the authenticated user based on cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createRouteHandlerClient } from '@/lib/supabase/server';

function hashValue(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const referralCode = request.cookies.get('aff_ref')?.value;

    if (!referralCode) {
      return NextResponse.json({ claimed: false, reason: 'no_ref' });
    }

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id, is_active')
      .eq('affiliate_code', referralCode)
      .single();

    if (!affiliate || !affiliate.is_active) {
      return NextResponse.json({ claimed: false, reason: 'invalid_ref' });
    }

    const { data: existingReferral } = await supabase
      .from('affiliate_referrals')
      .select('id, affiliate_id')
      .eq('referred_user_id', user.id)
      .single();

    const forwardedFor = request.headers.get('x-forwarded-for') || '';
    const firstForwardedIp = forwardedFor.split(',')[0]?.trim();
    const ipHash = firstForwardedIp ? hashValue(firstForwardedIp) : null;
    const userAgent = request.headers.get('user-agent') || '';
    const userAgentHash = userAgent ? hashValue(userAgent) : null;
    const referrer = request.headers.get('referer') || '';
    const referrerUrl = referrer ? new URL(referrer) : null;
    const source = referrerUrl?.searchParams?.get?.('utm_source') || null;
    const campaign = referrerUrl?.searchParams?.get?.('utm_campaign') || null;
    const medium = referrerUrl?.searchParams?.get?.('utm_medium') || null;

    if (existingReferral) {
      await supabase
        .from('affiliate_referrals')
        .update({
          last_touch_at: new Date().toISOString(),
        })
        .eq('id', existingReferral.id);

      const response = NextResponse.json({ claimed: true, updated: true });
      response.cookies.set('aff_ref', '', { maxAge: 0, path: '/' });
      return response;
    }

    const landingPath = referrerUrl?.pathname || null;

    const { error: insertError } = await supabase
      .from('affiliate_referrals')
      .insert({
        affiliate_id: affiliate.id,
        referred_user_id: user.id,
        first_touch_at: new Date().toISOString(),
        last_touch_at: new Date().toISOString(),
        source,
        campaign,
        medium,
        landing_path: landingPath,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
      });

    if (insertError) {
      console.error('[Affiliate] Failed to claim referral:', insertError);
      return NextResponse.json({ error: 'Failed to claim referral' }, { status: 500 });
    }

    const response = NextResponse.json({ claimed: true, created: true });
    response.cookies.set('aff_ref', '', { maxAge: 0, path: '/' });
    return response;
  } catch (error) {
    console.error('[Affiliate] Error claiming referral:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to claim referral' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
