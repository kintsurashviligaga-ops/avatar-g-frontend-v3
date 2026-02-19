/**
 * Admin Affiliates Management API
 * 
 * GET /api/admin/affiliates
 * List all affiliates with filtering
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type AffiliateRow = {
  id: string;
  is_active: boolean;
  [key: string]: unknown;
};

type CommissionRow = {
  commission_amount_cents: number;
  status: string;
};

export async function GET(request: NextRequest) {
  try {
    // 1. Verify admin access
    await requireAdmin();

    // 2. Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams?.get?.('search') || '';
    const status = searchParams?.get?.('status') || 'all';

    // 3. Query affiliates
    const supabase = createRouteHandlerClient();
    let query = supabase
      .from('affiliates')
      .select('*')
      .order('created_at', { ascending: false });

    // Apply filters
    if (search) {
      query = query.or(`affiliate_code.ilike.%${search}%,user_id.ilike.%${search}%`);
    }

    if (status !== 'all') {
      query = query.eq('is_active', status === 'active');
    }

    const { data: affiliates, error } = await query;

    if (error) {
      console.error('[Admin] Error fetching affiliates:', error);
      return NextResponse.json(
        { error: 'Failed to fetch affiliates' },
        { status: 500 }
      );
    }

    // 4. Get commission totals for each affiliate
    const affiliatesWithTotals = await Promise.all(
      ((affiliates || []) as AffiliateRow[]).map(async (affiliate) => {
        const { count: clickCount } = await supabase
          .from('affiliate_clicks')
          .select('id', { count: 'exact', head: true })
          .eq('affiliate_id', affiliate.id);

        const { count: signupCount } = await supabase
          .from('affiliate_referrals')
          .select('id', { count: 'exact', head: true })
          .eq('affiliate_id', affiliate.id);

        const { data: commissions } = await supabase
          .from('affiliate_commission_events')
          .select('commission_amount_cents, status')
          .eq('affiliate_id', affiliate.id);

        const typedCommissions = (commissions || []) as CommissionRow[];

        const totalPending = typedCommissions
          .filter((commission) => commission.status === 'pending')
          .reduce((sum: number, commission) => sum + commission.commission_amount_cents, 0);

        const totalEligible = typedCommissions
          .filter((commission) => commission.status === 'available')
          .reduce((sum: number, commission) => sum + commission.commission_amount_cents, 0);

        const totalPaid = typedCommissions
          .filter((commission) => commission.status === 'paid')
          .reduce((sum: number, commission) => sum + commission.commission_amount_cents, 0);

        return {
          ...affiliate,
          status: affiliate.is_active ? 'active' : 'disabled',
          total_clicks: clickCount || 0,
          total_signups: signupCount || 0,
          totals: {
            pending: totalPending,
            eligible: totalEligible,
            paid: totalPaid,
            total: totalPending + totalEligible + totalPaid,
          },
        };
      })
    );

    return NextResponse.json({
      affiliates: affiliatesWithTotals,
      total: affiliatesWithTotals.length,
    });
  } catch (error) {
    console.error('[Admin] Error:', error);
    
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/affiliates
 * Update affiliate status
 */
export async function PATCH(request: NextRequest) {
  try {
    // 1. Verify admin access
    await requireAdmin();

    // 2. Parse request body
    const body = await request.json();
    const { userId, status } = body;

    if (!userId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, status' },
        { status: 400 }
      );
    }

    if (!['active', 'disabled'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be active or disabled' },
        { status: 400 }
      );
    }

    // 3. Update affiliate
    const supabase = createRouteHandlerClient();
    const { error } = await supabase
      .from('affiliates')
      .update({ is_active: status === 'active' })
      .eq('user_id', userId);

    if (error) {
      console.error('[Admin] Error updating affiliate:', error);
      return NextResponse.json(
        { error: 'Failed to update affiliate' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Affiliate ${status === 'active' ? 'activated' : 'disabled'} successfully`,
    });
  } catch (error) {
    console.error('[Admin] Error:', error);
    
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
