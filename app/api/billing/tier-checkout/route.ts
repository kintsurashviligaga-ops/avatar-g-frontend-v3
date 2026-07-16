/**
 * POST /api/billing/tier-checkout — buy a launch USD subscription tier (Starter $15 · Pro $99 · Studio $299).
 *
 * THE FIX for the checkout blocker: the CreditsModal tier cards previously POSTed the tier's GEL amount
 * (41/267/807 ₾) to /api/billing/wallet-topup, which validates against the small REFILL_TIERS_GEL set
 * ([5,9,10,20,29,50,89,500]) → 400 → the plans were UNPURCHASABLE. This route instead builds a USD-denominated
 * Stripe Checkout Session via the purpose-built createUsdTierCheckoutSession (currency HARD-BOUND to 'usd',
 * amount VALIDATED against the exact [15,99,299] tier bounds), so the charge can only ever be the displayed price.
 *
 * Credit delivery happens in the Stripe webhook on checkout.session.completed (kind:'tier_topup'): it grants
 * `credits` (the tier's creditsIncluded, carried in session metadata) to profiles.credits_balance idempotently.
 *
 * Fail-open: 503 when Stripe is unconfigured (same as the sibling billing routes). USD settlement is Stripe-account
 * gated — if the account can't transact USD, Stripe rejects and we return a clean 502.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createUsdTierCheckoutSession, getOrCreateCustomer } from '@/lib/billing/stripe';
import { getBillingProvider, BillingProviderUnavailableError } from '@/lib/monetization/provider';
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';

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

    const body = (await request.json().catch(() => ({}))) as { tierId?: string };
    const tier = PRICING_TIERS.find((t) => t.id === body.tierId);
    if (!tier) {
      return NextResponse.json(
        { error: `tierId must be one of ${PRICING_TIERS.map((t) => t.id).join(', ')}` },
        { status: 400 },
      );
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
      const url = await createUsdTierCheckoutSession({
        customerId,
        priceUsd: tier.priceUsd,
        successUrl: `${origin}/dashboard?tier=success`,
        cancelUrl: `${origin}/dashboard?tier=canceled`,
        // The webhook reads user_id + credits to grant the tier's credit pool idempotently on completion.
        metadata: { user_id: user.id, tier_id: tier.id, credits: String(tier.creditsIncluded) },
      });
      return NextResponse.json({ url });
    } catch (e) {
      // Most commonly: the Stripe account does not support USD settlement.
      return NextResponse.json(
        { error: 'usd_unsupported', message: e instanceof Error ? e.message.slice(0, 200) : 'tier checkout failed' },
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
    return NextResponse.json({ error: 'Failed to create tier checkout', message: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}
