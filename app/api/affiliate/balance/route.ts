/**
 * GET /api/affiliate/balance
 * Returns available, pending, and paid balances
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type CommissionRow = {
  commission_amount_cents: number;
  status: string;
};

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
      return NextResponse.json({ available: 0, pending: 0, paid: 0, total: 0 });
    }

    const now = new Date().toISOString();

    await supabase
      .from('affiliate_commission_events')
      .update({ status: 'available' })
      .eq('affiliate_id', affiliate.id)
      .eq('status', 'pending')
      .lte('available_at', now);

    const { data: commissions } = await supabase
      .from('affiliate_commission_events')
      .select('commission_amount_cents, status')
      .eq('affiliate_id', affiliate.id);

    const totals = ((commissions || []) as CommissionRow[]).reduce(
      (acc: { pending: number; available: number; paid: number; total: number }, commission) => {
        if (commission.status === 'pending') acc.pending += commission.commission_amount_cents;
        if (commission.status === 'available') acc.available += commission.commission_amount_cents;
        if (commission.status === 'paid') acc.paid += commission.commission_amount_cents;
        if (commission.status !== 'reversed') acc.total += commission.commission_amount_cents;
        return acc;
      },
      { pending: 0, available: 0, paid: 0, total: 0 }
    );

    return NextResponse.json(totals);
  } catch (error) {
    console.error('[Affiliate] Error fetching balance:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch balance' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed. Use GET.' }, { status: 405 });
}
