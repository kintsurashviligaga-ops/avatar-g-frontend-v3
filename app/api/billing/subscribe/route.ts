/**
 * POST /api/billing/subscribe { tier: 'starter' | 'creator' | 'business' } → { url } of a Stripe Checkout Session in
 * mode:'subscription' for that tier's RECURRING price (lib/billing/tiers.ts).
 *
 * ⚠️ INERT UNTIL CONFIGURED: 503 { error: 'not_configured' } while STRIPE_PRICE_<TIER> (or STRIPE_SECRET_KEY) is
 * unset. Nothing on the site calls this yet — the pricing page and CreditsModal still sell one-time packs through
 * /api/billing/tier-checkout. Activation checklist: docs/billing/TIERS.md.
 *
 * What happens after the customer pays: Stripe sends invoice.paid → /api/stripe/webhook grants the tier's monthly
 * credits once per invoice (lib/billing/subscriptionAllowance) and refreshes the `subscriptions` row that
 * resolveUserTier() reads.
 *
 * ⚠️ user_id GOES ON THE SUBSCRIPTION, NOT JUST THE SESSION. Stripe does not order webhook events, and the first
 * invoice.paid often lands before checkout.session.completed has stored any customer mapping. subscription_data
 * .metadata is snapshotted onto every invoice the subscription ever produces, so the grant can always find its user.
 * The id comes from the verified session — never from the request body.
 */
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getStripe } from '@/lib/billing/stripe';
import { PAID_TIER_IDS, isPaidTierId, priceIdForTier, type PaidTierId } from '@/lib/billing/tiers';
import { resolveUserTierDetailed, type TierReader } from '@/lib/billing/resolveTier';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function serviceClient(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/** Reuse the user's Stripe customer when we already know it, so one person does not become many customers. */
async function knownCustomerId(db: TierReader | null, userId: string): Promise<string | null> {
  if (!db) return null;
  try {
    const { data, error } = await db.from('subscriptions').select('stripe_customer_id').eq('user_id', userId).limit(5);
    if (error || !Array.isArray(data)) return null;
    const hit = (data as Array<{ stripe_customer_id?: unknown }>).find(
      (r) => typeof r.stripe_customer_id === 'string' && r.stripe_customer_id.startsWith('cus_'),
    );
    return (hit?.stripe_customer_id as string | undefined) ?? null;
  } catch {
    return null; // a missing table (today's live state) just means "no known customer"
  }
}

export async function POST(request: NextRequest) {
  let user: User;
  try {
    user = await requireAuthenticatedUser(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { tier?: unknown } | null;
  const tier = body?.tier;
  if (!isPaidTierId(tier)) {
    return NextResponse.json({ error: 'invalid_tier', allowed: PAID_TIER_IDS }, { status: 400 });
  }

  const priceId = priceIdForTier(tier, process.env);
  if (!priceId || !(process.env.STRIPE_SECRET_KEY ?? '').trim()) {
    return NextResponse.json({ error: 'not_configured', tier }, { status: 503 });
  }

  const db = serviceClient();

  // ⚠️ A SECOND CHECKOUT IS A SECOND MONTHLY CHARGE. A plan change on a live subscription is a Stripe subscription
  // UPDATE (the customer portal, /api/billing/portal), not a new subscription stacked on the old one.
  const current = await resolveUserTierDetailed(db, user.id);
  if (current.source === 'subscription') {
    return NextResponse.json(
      { error: 'already_subscribed', tier: current.tier, manage: '/api/billing/portal' },
      { status: 409 },
    );
  }

  const customerId = await knownCustomerId(db, user.id);
  const origin = new URL(request.url).origin;
  const metadata: Record<string, string> = { kind: 'subscription', user_id: user.id, tier: tier as PaidTierId };

  try {
    const session = await getStripe().checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      ...(customerId ? { customer: customerId } : user.email ? { customer_email: user.email } : {}),
      client_reference_id: user.id,
      metadata,
      subscription_data: { metadata: { user_id: user.id, tier } },
      // A 100%-off code would make a $0 invoice, which grants no allowance (subscriptionAllowance 'zero_amount').
      // Comps go through profiles.tier instead.
      allow_promotion_codes: false,
      success_url: `${origin}/dashboard?subscription=success&tier=${tier}`,
      cancel_url: `${origin}/dashboard?subscription=canceled`,
    });
    if (!session.url) {
      return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
    }
    return NextResponse.json({ url: session.url, tier });
  } catch (e) {
    // The Stripe error stays in the server log — provider bodies never reach the browser (lib/api/providerError).
    // eslint-disable-next-line no-console
    console.error('[billing/subscribe] checkout session failed:', e instanceof Error ? e.message.slice(0, 300) : e);
    return NextResponse.json({ error: 'checkout_failed' }, { status: 502 });
  }
}
