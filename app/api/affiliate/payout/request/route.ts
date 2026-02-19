/**
 * POST /api/affiliate/payout/request
 * Create payout request and optionally transfer via Stripe Connect
 */

import { NextRequest, NextResponse } from 'next/server';
import { getStripe } from '@/lib/billing/stripe';
import { createRouteHandlerClient } from '@/lib/supabase/server';

type CommissionEventRow = {
  id: string;
  affiliate_id: string;
  referred_user_id: string | null;
  stripe_event_id: string;
  stripe_object_id: string | null;
  event_type: string;
  currency: string;
  gross_amount_cents: number;
  commission_amount_cents: number;
  status: string;
  available_at: string | null;
};

const MIN_PAYOUT_CENTS = Number(process.env.AFFILIATE_MIN_PAYOUT_CENTS || '1000');

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const amountCents = Number(body?.amountCents || 0);

    if (!amountCents || amountCents <= 0) {
      return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });
    }

    if (amountCents < MIN_PAYOUT_CENTS) {
      return NextResponse.json(
        { error: `Minimum payout is $${(MIN_PAYOUT_CENTS / 100).toFixed(2)}` },
        { status: 400 }
      );
    }

    const { data: affiliate } = await supabase
      .from('affiliates')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!affiliate || !affiliate.is_active) {
      return NextResponse.json({ error: 'Affiliate not active' }, { status: 403 });
    }

    const now = new Date().toISOString();

    await supabase
      .from('affiliate_commission_events')
      .update({ status: 'available' })
      .eq('affiliate_id', affiliate.id)
      .eq('status', 'pending')
      .lte('available_at', now);

    const { data: availableEvents } = await supabase
      .from('affiliate_commission_events')
      .select('*')
      .eq('affiliate_id', affiliate.id)
      .eq('status', 'available')
      .order('available_at', { ascending: true });

    const typedAvailableEvents = (availableEvents || []) as CommissionEventRow[];

    const availableTotal = typedAvailableEvents.reduce(
      (sum: number, item) => sum + item.commission_amount_cents,
      0
    );

    if (amountCents > availableTotal) {
      return NextResponse.json({ error: 'Amount exceeds available balance' }, { status: 400 });
    }

    const { data: connectAccount } = await supabase
      .from('stripe_connect_accounts')
      .select('stripe_account_id, payouts_enabled')
      .eq('user_id', user.id)
      .single();

    const payoutInsert = await supabase
      .from('affiliate_payouts')
      .insert({
        affiliate_id: affiliate.id,
        amount_cents: amountCents,
        currency: 'usd',
        status: connectAccount?.payouts_enabled ? 'processing' : 'requested',
        notes: connectAccount?.payouts_enabled ? null : 'Connect required',
      })
      .select()
      .single();

    if (payoutInsert.error || !payoutInsert.data) {
      return NextResponse.json({ error: 'Failed to create payout' }, { status: 500 });
    }

    if (!connectAccount?.stripe_account_id || !connectAccount.payouts_enabled) {
      return NextResponse.json({
        payout: payoutInsert.data,
        requiresConnect: true,
        message: 'Connect Stripe to receive payouts',
      });
    }

    const stripe = getStripe();
    let transfer;

    try {
      transfer = await stripe.transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: connectAccount.stripe_account_id,
        metadata: {
          affiliate_id: affiliate.id,
          payout_id: payoutInsert.data.id,
        },
      });

      await supabase
        .from('affiliate_payouts')
        .update({
          status: 'paid',
          stripe_transfer_id: transfer.id,
          processed_at: new Date().toISOString(),
        })
        .eq('id', payoutInsert.data.id);
    } catch (transferError) {
      await supabase
        .from('affiliate_payouts')
        .update({
          status: 'failed',
          notes: transferError instanceof Error ? transferError.message : 'Transfer failed',
        })
        .eq('id', payoutInsert.data.id);

      return NextResponse.json(
        { error: 'Transfer failed', details: transferError instanceof Error ? transferError.message : 'Unknown error' },
        { status: 500 }
      );
    }

    let remaining = amountCents;
    const updates: string[] = [];

    for (const event of typedAvailableEvents) {
      if (remaining <= 0) break;

      if (event.commission_amount_cents <= remaining) {
        updates.push(event.id);
        remaining -= event.commission_amount_cents;
      } else {
        const paidPortion = remaining;
        const remainder = event.commission_amount_cents - remaining;

        await supabase
          .from('affiliate_commission_events')
          .update({
            commission_amount_cents: paidPortion,
            status: 'paid',
          })
          .eq('id', event.id);

        await supabase
          .from('affiliate_commission_events')
          .insert({
            affiliate_id: event.affiliate_id,
            referred_user_id: event.referred_user_id,
            stripe_event_id: `${event.stripe_event_id}-split-${payoutInsert.data.id}`,
            stripe_object_id: event.stripe_object_id,
            event_type: 'affiliate.split',
            currency: event.currency,
            gross_amount_cents: event.gross_amount_cents,
            commission_amount_cents: remainder,
            status: 'available',
            available_at: event.available_at,
            created_at: new Date().toISOString(),
          });

        remaining = 0;
      }
    }

    if (updates.length > 0) {
      await supabase
        .from('affiliate_commission_events')
        .update({ status: 'paid' })
        .in('id', updates);
    }

    return NextResponse.json({ payout: payoutInsert.data, transferId: transfer.id });
  } catch (error) {
    console.error('[Affiliate] Error requesting payout:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to request payout' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed. Use POST.' }, { status: 405 });
}
