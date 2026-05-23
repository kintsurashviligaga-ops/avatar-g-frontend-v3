/**
 * POST /api/billing/wallet-topup — one-off GEL (₾) wallet refill checkout.
 *
 * Body: { amountGel: 5 | 10 | 20 | 50 }. Creates a Stripe Checkout Session priced
 * in literal GEL. Fail-open: 503 when Stripe is unconfigured. GEL settlement is
 * Stripe-account-gated — if the account can't transact GEL, Stripe rejects and we
 * return a clean 502 (the subscription/plan path is unaffected).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createWalletTopupSession, getOrCreateCustomer } from '@/lib/billing/stripe';
import { getBillingProvider, BillingProviderUnavailableError } from '@/lib/monetization/provider';
import { REFILL_TIERS_GEL } from '@/lib/billing/gel';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const provider = getBillingProvider();
    if (provider.kind === 'none') {
      return NextResponse.json(
        { error: 'Billing provider unavailable', error_code: 'BILLING_PROVIDER_UNAVAILABLE' },
        { status: 503 },
      );
    }

    const user = await requireAuthenticatedUser(request);
    const supabase = createRouteHandlerClient();

    const body = (await request.json().catch(() => ({}))) as { amountGel?: number };
    const amountGel = Number(body.amountGel);
    if (!REFILL_TIERS_GEL.includes(amountGel as (typeof REFILL_TIERS_GEL)[number])) {
      return NextResponse.json({ error: `amountGel must be one of ${REFILL_TIERS_GEL.join(', ')}` }, { status: 400 });
    }

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .single();

    let customerId = subscription?.stripe_customer_id as string | undefined;
    if (!customerId || customerId.startsWith('temp_')) {
      customerId = await getOrCreateCustomer({ userId: user.id, email: user.email || '', name: user.user_metadata?.full_name });
      await supabase.from('subscriptions').upsert({ user_id: user.id, stripe_customer_id: customerId, plan: 'FREE', status: 'active' });
    }

    const origin = request.headers.get('origin') || 'http://localhost:3000';
    try {
      const url = await createWalletTopupSession({
        customerId,
        amountGel,
        successUrl: `${origin}/dashboard?topup=success`,
        cancelUrl: `${origin}/dashboard?topup=canceled`,
      });
      return NextResponse.json({ url });
    } catch (e) {
      // Most commonly: the Stripe account does not support GEL settlement.
      return NextResponse.json(
        { error: 'gel_unsupported', message: e instanceof Error ? e.message.slice(0, 200) : 'wallet top-up failed' },
        { status: 502 },
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof BillingProviderUnavailableError) {
      return NextResponse.json({ error: 'Billing provider unavailable', error_code: error.code }, { status: 503 });
    }
    return NextResponse.json({ error: 'Failed to create wallet top-up', message: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}
