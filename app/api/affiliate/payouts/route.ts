/**
 * GET /api/affiliate/payouts
 * Returns payout history for affiliate
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (!affiliate) {
      return NextResponse.json({ payouts: [] });
    }

    const { data: payouts, error } = await supabase
      .from('affiliate_payouts')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('requested_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[Affiliate] Failed to fetch payouts:', error);
      return NextResponse.json({ error: 'Failed to fetch payouts' }, { status: 500 });
    }

    return NextResponse.json({ payouts: payouts || [] });
  } catch (error) {
    console.error('[Affiliate] Error fetching payouts:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch payouts' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
