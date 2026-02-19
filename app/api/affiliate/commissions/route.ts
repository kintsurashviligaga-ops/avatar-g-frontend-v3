/**
 * GET /api/affiliate/commissions
 * Returns commission ledger for current affiliate
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
      return NextResponse.json({ commissions: [] });
    }

    const { data: commissions, error } = await supabase
      .from('affiliate_commission_events')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[Affiliate] Failed to fetch commissions:', error);
      return NextResponse.json({ error: 'Failed to fetch commissions' }, { status: 500 });
    }

    return NextResponse.json({ commissions: commissions || [] });
  } catch (error) {
    console.error('[Affiliate] Error fetching commissions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch commissions' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
