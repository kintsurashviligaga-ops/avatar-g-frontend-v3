/**
 * GET /api/finance/seller/summary
 * Authenticated seller: Sales, GMV, fees, and payouts summary
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type MarketplaceOrderRow = {
  gross_amount_cents: number | null;
  platform_fee_cents: number | null;
};

type SellerPayoutRow = {
  status: string | null;
  amount_cents: number | null;
};

export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get seller profile
    const { data: sellerProfile, error: profileError } = await supabase
      .from('seller_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      throw profileError;
    }

    if (!sellerProfile) {
      return NextResponse.json({ error: 'Not a seller' }, { status: 404 });
    }

    // Get marketplace orders for this seller
    const { data: orders, error: ordersError } = await supabase
      .from('marketplace_orders')
      .select('*')
      .eq('seller_user_id', user.id)
      .order('created_at', { ascending: false });

    if (ordersError) {
      throw ordersError;
    }

    // Get seller payouts
    const { data: payouts, error: payoutsError } = await supabase
      .from('seller_payouts')
      .select('*')
      .eq('seller_user_id', user.id)
      .order('created_at', { ascending: false });

    if (payoutsError) {
      throw payoutsError;
    }

    // Calculate summary
    const typedOrders = (orders || []) as MarketplaceOrderRow[];
    const typedPayouts = (payouts || []) as SellerPayoutRow[];

    const totalGmv = typedOrders.reduce((sum: number, order: MarketplaceOrderRow) => sum + (order.gross_amount_cents || 0), 0);
    const totalFees = typedOrders.reduce((sum: number, order: MarketplaceOrderRow) => sum + (order.platform_fee_cents || 0), 0);
    const totalNet = totalGmv - totalFees;
    const totalPaidOut = typedPayouts
      .filter((payout: SellerPayoutRow) => payout.status === 'paid')
      .reduce((sum: number, payout: SellerPayoutRow) => sum + (payout.amount_cents || 0), 0);

    return NextResponse.json({
      seller: {
        id: sellerProfile.id,
        displayName: sellerProfile.display_name,
        stripeAccountId: sellerProfile.stripe_account_id,
      },
      orders: orders || [],
      payouts: payouts || [],
      summary: {
        totalGmv,
        totalFees,
        totalNet,
        totalPaidOut,
        pendingPayout: totalNet - totalPaidOut,
        orderCount: orders?.length || 0,
        payoutCount: payouts?.length || 0,
      },
    });
  } catch (error) {
    console.error('[GET /api/finance/seller/summary]', error);
    return NextResponse.json({ error: 'Failed to fetch seller summary' }, { status: 500 });
  }
}
