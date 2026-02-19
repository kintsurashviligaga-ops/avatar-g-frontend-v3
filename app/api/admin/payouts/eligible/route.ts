/**
 * Admin Payouts API
 * 
 * GET /api/admin/payouts/eligible
 * Get affiliates eligible for payout
 * 
 * POST /api/admin/payouts
 * Create a payout record
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/adminGuard';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type AffiliateRow = {
  id: string;
  affiliate_code: string;
};

type CommissionRow = {
  id: string;
  created_at: string;
  commission_amount_cents: number;
};

const MINIMUM_PAYOUT_CENTS = 5000; // $50.00

export async function GET(_request: NextRequest) {
  try {
    // 1. Verify admin access
    await requireAdmin();

    // 2. Get affiliates with eligible commissions
    const supabase = createRouteHandlerClient();
    
    // Get all active affiliates
    const { data: affiliates, error: affiliatesError } = await supabase
      .from('affiliates')
      .select('*')
      .eq('is_active', true);

    if (affiliatesError) {
      console.error('[Admin] Error fetching affiliates:', affiliatesError);
      return NextResponse.json(
        { error: 'Failed to fetch affiliates' },
        { status: 500 }
      );
    }

    // Calculate eligible amounts for each
    const eligible = await Promise.all(
      ((affiliates || []) as AffiliateRow[]).map(async (affiliate) => {
        const { data: commissions } = await supabase
          .from('affiliate_commission_events')
          .select('commission_amount_cents')
          .eq('affiliate_id', affiliate.id)
          .eq('status', 'available');

        const eligibleAmount = ((commissions || []) as CommissionRow[]).reduce(
          (sum: number, commission) => sum + commission.commission_amount_cents,
          0
        );

        // Get last payout
        const { data: lastPayout } = await supabase
          .from('affiliate_payouts')
          .select('requested_at')
          .eq('affiliate_id', affiliate.id)
          .order('requested_at', { ascending: false })
          .limit(1)
          .single();

        return {
          affiliate_id: affiliate.id,
          affiliate_code: affiliate.affiliate_code,
          eligible_amount_cents: eligibleAmount,
          last_payout_at: lastPayout?.requested_at || null,
        };
      })
    );

    // Filter out those below minimum threshold
    const eligibleFiltered = eligible.filter(
      (a) => a.eligible_amount_cents >= MINIMUM_PAYOUT_CENTS
    );

    return NextResponse.json({
      eligible: eligibleFiltered,
      total: eligibleFiltered.length,
      minimum_threshold_cents: MINIMUM_PAYOUT_CENTS,
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

export async function POST(request: NextRequest) {
  try {
    // 1. Verify admin access
    await requireAdmin();

    // 2. Parse request body
    const body = await request.json();
    const { affiliateId, amountCents, notes } = body;

    if (!affiliateId || !amountCents) {
      return NextResponse.json(
        { error: 'Missing required fields: affiliateId, amountCents' },
        { status: 400 }
      );
    }

    if (amountCents < MINIMUM_PAYOUT_CENTS) {
      return NextResponse.json(
        { error: `Amount must be at least $${MINIMUM_PAYOUT_CENTS / 100}` },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient();

    // 3. Get all eligible commissions
    const { data: eligibleCommissions, error: commissionsError } = await supabase
      .from('affiliate_commission_events')
      .select('*')
      .eq('affiliate_id', affiliateId)
      .eq('status', 'available');

    if (commissionsError || !eligibleCommissions || eligibleCommissions.length === 0) {
      return NextResponse.json(
        { error: 'No eligible commissions found for this affiliate' },
        { status: 400 }
      );
    }

    const typedEligibleCommissions = (eligibleCommissions || []) as CommissionRow[];

    const totalEligible = typedEligibleCommissions.reduce(
      (sum: number, commission) => sum + commission.commission_amount_cents,
      0
    );

    if (amountCents > totalEligible) {
      return NextResponse.json(
        { error: 'Payout amount exceeds eligible balance' },
        { status: 400 }
      );
    }

    // 4. Create payout record
    const _periodStart = new Date(
      Math.min(...typedEligibleCommissions.map((commission) => new Date(commission.created_at).getTime()))
    ).toISOString();
    
    const _periodEnd = new Date().toISOString();

    const { data: payout, error: payoutError } = await supabase
      .from('affiliate_payouts')
      .insert({
        affiliate_id: affiliateId,
        amount_cents: amountCents,
        status: 'paid',
        notes,
        requested_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (payoutError) {
      console.error('[Admin] Error creating payout:', payoutError);
      return NextResponse.json(
        { error: 'Failed to create payout' },
        { status: 500 }
      );
    }

    // 5. Update commissions to 'paid' status
    const commissionsToPay = typedEligibleCommissions.slice(
      0,
      Math.ceil((amountCents / totalEligible) * typedEligibleCommissions.length)
    );

    const { error: updateError } = await supabase
      .from('affiliate_commission_events')
      .update({
        status: 'paid',
        stripe_object_id: payout.id,
      })
      .in(
        'id',
        commissionsToPay.map((commission) => commission.id)
      );

    if (updateError) {
      console.error('[Admin] Error updating commissions:', updateError);
      // Rollback payout
      await supabase.from('affiliate_payouts').delete().eq('id', payout.id);
      
      return NextResponse.json(
        { error: 'Failed to update commissions' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      payout,
      commissions_updated: commissionsToPay.length,
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
