/**
 * GET /api/finance/affiliate/summary
 * Authenticated affiliate: Commission earnings, pending, available, and paid totals
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type CommissionRow = {
  status: string;
  commission_cents: number | null;
};

type PayoutRow = {
  status: string;
  amount_cents: number | null;
};

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get affiliate profile
    const { data: affiliate, error: affError } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (affError && affError.code !== 'PGRST116') {
      throw affError;
    }

    if (!affiliate) {
      return NextResponse.json({ error: 'Not an affiliate' }, { status: 404 });
    }

    // Get commission events
    const { data: commissions, error: commError } = await supabase
      .from('affiliate_commission_events')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false });

    if (commError) {
      throw commError;
    }

    // Get payouts
    const { data: payouts, error: payoutsError } = await supabase
      .from('affiliate_payouts')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .order('created_at', { ascending: false });

    if (payoutsError) {
      throw payoutsError;
    }

    // Calculate balances
    const typedCommissions = (commissions || []) as CommissionRow[];
    const typedPayouts = (payouts || []) as PayoutRow[];

    const pending = typedCommissions
      .filter((commission) => commission.status === 'pending')
      .reduce((sum: number, commission) => sum + (commission.commission_cents || 0), 0);

    const available = typedCommissions
      .filter((commission) => commission.status === 'available')
      .reduce((sum: number, commission) => sum + (commission.commission_cents || 0), 0);

    const paid = typedCommissions
      .filter((commission) => commission.status === 'paid')
      .reduce((sum: number, commission) => sum + (commission.commission_cents || 0), 0);

    const reversed = typedCommissions
      .filter((commission) => commission.status === 'reversed')
      .reduce((sum: number, commission) => sum + (commission.commission_cents || 0), 0);

    const totalPaidOut = typedPayouts
      .filter((payout) => payout.status === 'paid')
      .reduce((sum: number, payout) => sum + (payout.amount_cents || 0), 0);

    return NextResponse.json({
      affiliate: {
        id: affiliate.id,
        status: affiliate.status,
        referralCode: affiliate.referral_code,
      },
      commissions: commissions || [],
      payouts: payouts || [],
      balances: {
        pending,
        available,
        paid,
        reversed,
        total: pending + available,
      },
      summary: {
        totalEarned: pending + available + paid - reversed,
        totalPaidOut,
        commissionCount: commissions?.length || 0,
        payoutCount: payouts?.length || 0,
      },
    });
  } catch (error) {
    console.error('[GET /api/finance/affiliate/summary]', error);
    return NextResponse.json({ error: 'Failed to fetch affiliate summary' }, { status: 500 });
  }
}
