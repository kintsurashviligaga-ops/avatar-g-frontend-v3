/**
 * POST /api/billing/webhook — Stripe webhook handler (plan upgrades + wallet top-ups).
 *
 * NOTE (audit 2026-06-26): this is a SAFE sibling of /api/stripe/webhook. Both verify the
 * signature with STRIPE_WEBHOOK_SECRET and credit via creditWalletGel, which is IDEMPOTENT
 * on `stripe:<session.id>` — so even if an event reaches both, a top-up is credited exactly
 * once. The Stripe dashboard currently registers /api/webhooks/stripe + /api/stripe/webhook;
 * this route is not registered there (no events hit it) but is kept for back-compat. Do NOT
 * delete either — removal risks breaking whichever endpoint a given Stripe config points at.
 */
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getPlan, type PlanTier } from '../../../../lib/billing/plans';
import { getPlanByStripePriceId } from '@/lib/billing/stripe-prices';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { BillingProviderUnavailableError, getBillingProvider } from '@/lib/monetization/provider';
import { creditWalletGel, grantPurchasedCredits } from '@/lib/billing/wallet-ledger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function markProcessed(event: Stripe.Event) {
  const supabase = createRouteHandlerClient();
  await supabase.from('billing_webhook_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event.data.object as unknown as Record<string, unknown>,
  });
}

async function isProcessed(eventId: string): Promise<boolean> {
  const supabase = createRouteHandlerClient();
  const { data } = await supabase
    .from('billing_webhook_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', eventId)
    .single();

  return Boolean(data);
}

async function getUserIdByCustomer(customerId: string): Promise<string | null> {
  const supabase = createRouteHandlerClient();
  const { data } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .single();

  return data?.user_id || null;
}

async function applyPlanAndAllowance(input: {
  userId: string;
  customerId: string;
  subscriptionId: string | null;
  plan: PlanTier;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}) {
  const supabase = createRouteHandlerClient();
  const monthlyAllowance = getPlan(input.plan).monthlyCredits;

  await supabase.from('subscriptions').upsert({
    user_id: input.userId,
    stripe_customer_id: input.customerId,
    stripe_subscription_id: input.subscriptionId,
    plan: input.plan,
    status: input.status,
    current_period_end: input.currentPeriodEnd,
    cancel_at_period_end: input.cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  await supabase.from('credits').upsert({
    user_id: input.userId,
    monthly_allowance: monthlyAllowance,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  await supabase.rpc('reset_user_credits_if_due', { p_user_id: input.userId });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = String(subscription.customer);
  const priceId = subscription.items.data[0]?.price?.id;
  const resolvedPlan = priceId ? getPlanByStripePriceId(priceId) : null;
  const plan: PlanTier = resolvedPlan || 'FREE';
  const userId = await getUserIdByCustomer(customerId);

  if (!userId) {
    return;
  }

  const periodEndUnix = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;

  await applyPlanAndAllowance({
    userId,
    customerId,
    subscriptionId: subscription.id,
    plan,
    status: subscription.status,
    currentPeriodEnd: periodEndUnix ? new Date(periodEndUnix * 1000).toISOString() : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end || false,
  });
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = String(subscription.customer);
  const userId = await getUserIdByCustomer(customerId);

  if (!userId) {
    return;
  }

  await applyPlanAndAllowance({
    userId,
    customerId,
    subscriptionId: null,
    plan: 'FREE',
    status: 'canceled',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}

async function handleWalletTopup(session: Stripe.Checkout.Session) {
  const customerId = session.customer ? String(session.customer) : '';
  const userId = customerId ? await getUserIdByCustomer(customerId) : null;
  const amountGel = Number(session.metadata?.amount_gel);
  if (!userId || !Number.isFinite(amountGel) || amountGel <= 0) return;
  const isFounderVerify = session.metadata?.is_founder_verification === 'true';
  if (isFounderVerify) {
    // eslint-disable-next-line no-console
    console.info(`[FOUNDER_VERIFY] hydrating ledger=${session.metadata?.target_ledger ?? 'fiat_gel'} user=${userId} amount=${amountGel}₾ session=${session.id}`);
  }
  // Idempotent on `stripe:<session.id>` (the RPC dedupes; the outer event-id
  // guard dedupes re-delivered events) → never double-credits. Same crediting
  // path for founder verification and organic top-ups (single source of truth).
  await creditWalletGel(userId, amountGel, `stripe:${session.id}`);
}

async function handleTierTopup(session: Stripe.Checkout.Session) {
  const credits = Number(session.metadata?.credits);
  const userId = session.metadata?.user_id
    || (session.customer ? await getUserIdByCustomer(String(session.customer)) : null);
  if (!userId || !Number.isFinite(credits) || credits <= 0) return;
  // Idempotent on `stripe:<session.id>` (RPC ref-dedup + the outer event-id guard) → never double-credits,
  // including across both registered webhook endpoints. Grants to profiles.credits_balance (spendable).
  await grantPurchasedCredits(userId, credits, `stripe:${session.id}`);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  // One-off GEL wallet top-up → credit the ledger, then stop (no subscription).
  if (session.metadata?.kind === 'wallet_topup') {
    await handleWalletTopup(session);
    return;
  }

  // USD launch tier (Starter/Pro/Studio) → grant the tier's credit pool, then stop.
  if (session.metadata?.kind === 'tier_topup') {
    await handleTierTopup(session);
    return;
  }

  const customerId = String(session.customer);
  const userId = await getUserIdByCustomer(customerId);

  if (!userId) {
    return;
  }

  await createRouteHandlerClient().from('subscriptions').update({
    stripe_subscription_id: session.subscription ? String(session.subscription) : null,
    status: 'active',
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
}

export async function POST(request: NextRequest) {
  try {
    const provider = getBillingProvider();
    if (provider.kind === 'none') {
      return NextResponse.json(
        {
          error: 'Billing provider unavailable',
          error_code: 'BILLING_PROVIDER_UNAVAILABLE',
          message: 'Stripe is not configured. Configure STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.',
        },
        { status: 503 }
      );
    }

    const signature = request.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    const payload = await request.text();

    let event: Stripe.Event;
    try {
      event = provider.verifyWebhook(payload, signature);
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    if (await isProcessed(event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded':
      case 'invoice.payment_failed':
        break;
      default:
        break;
    }

    await markProcessed(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    if (error instanceof BillingProviderUnavailableError) {
      return NextResponse.json(
        {
          error: 'Billing provider unavailable',
          error_code: error.code,
          message: error.message,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: 'Webhook handler failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
