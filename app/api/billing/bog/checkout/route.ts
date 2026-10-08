/**
 * POST /api/billing/bog/checkout — start a Bank of Georgia payment: a PAYG top-up or a monthly plan.
 *
 *   { kind: 'topup', amountGel }                         → credits (floor(amount × 10)), once
 *   { kind: 'plan',  tierId: starter|creator|business }  → the plan's monthly allowance now, then every month on the
 *                                                          saved card (the pricing page's basic/pro ids are accepted)
 *   optional { locale: 'ka'|'en'|'ru' } — the language of BOG's page and of the page the customer returns to.
 *
 * → { redirectUrl, orderId, autoRenew? }. BOG returns the customer to /{locale}/dashboard?bog=<orderId>&pay=…,
 * where the return handler asks /api/billing/bog/orders/<orderId> what happened.
 *
 * ⚠️ THE PENDING ORDER IS WRITTEN FIRST, WITH WHAT IT IS WORTH. Amount, credits and tier come from the server-side
 * catalogue (lib/billing/bogCatalog) and are stored before BOG ever hears of the order; the callback credits from
 * that row, never from anything the bank or the browser says. No row → no order → no payment we cannot credit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getActiveTiers } from '@/lib/billing/pricingConfig.db';
import { bogConfig, createBogOrder, saveCardForAutomaticPayments } from '@/lib/billing/bogClient';
import { bogPlanOffer, topupCredits } from '@/lib/billing/bogCatalog';
import { bogCallbackUrl, newBogOrderId } from '@/lib/billing/bogSettlement';
import { TIERS } from '@/lib/billing/tiers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Locale = 'ka' | 'en' | 'ru';
const asLocale = (v: unknown): Locale => (v === 'en' || v === 'ru' ? v : 'ka');

/** A person starts a handful of checkouts an hour; this stops a script minting thousands of BOG orders. */
const CHECKOUT_USER_LIMIT: Parameters<typeof checkRateLimitByKey>[1] = {
  maxRequests: 20,
  windowMs: 60 * 60_000,
  keyPrefix: 'rl:bog:checkout:user',
};

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status });

export async function POST(request: NextRequest) {
  const cfg = bogConfig();
  if (!cfg) return json({ error: 'Bank of Georgia payments are not configured', error_code: 'BOG_UNCONFIGURED' }, 503);

  let userId: string;
  try {
    userId = (await requireAuthenticatedUser(request)).id;
  } catch {
    return json({ error: 'Unauthorized', error_code: 'AUTH_REQUIRED' }, 401);
  }
  const ipLimited = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (ipLimited) return ipLimited;
  const userLimited = await checkRateLimitByKey(userId, CHECKOUT_USER_LIMIT);
  if (userLimited) return userLimited;

  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; amountGel?: unknown; tierId?: unknown; locale?: unknown };
  const locale = asLocale(body.locale);

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return json({ error: 'server_misconfigured', error_code: 'NO_SERVICE_ROLE' }, 503);
  }

  // ── What is being bought, priced by the server ──────────────────────────────────────────────────────────
  let row: Record<string, unknown>;
  let productId: string;
  let description: string;
  const isPlan = body.kind === 'plan' || body.kind === 'subscription';
  if (body.kind === 'topup') {
    const amountGel = Number(body.amountGel);
    const purchasable = await getActiveTiers();
    if (!Number.isFinite(amountGel) || !purchasable.some((t) => t.gelAmount === amountGel)) {
      return json({ error: `amountGel must be one of ${purchasable.map((t) => t.gelAmount).join(', ')}`, error_code: 'BAD_AMOUNT' }, 400);
    }
    const credits = topupCredits(amountGel);
    row = { kind: 'topup', amount_gel: amountGel, credits };
    productId = `credits-${credits}`;
    description = `MyAvatar — ${credits} credits`;
  } else if (isPlan) {
    const offer = bogPlanOffer(body.tierId);
    if (!offer) return json({ error: 'tierId must be starter, creator or business', error_code: 'BAD_TIER' }, 400);
    // ⚠️ ONE LIVE PLAN PER TIER. Two tabs, or a second click after paying, would otherwise charge the same plan twice
    // for overlapping months. A different tier is an upgrade/downgrade: allowed, and the new plan stops the old one
    // from renewing once it is paid (bog_fulfill_order).
    const { data: live, error: liveErr } = await svc
      .from('subscriptions')
      .select('tier,current_period_end')
      .eq('user_id', userId)
      .eq('provider', 'bog')
      .in('status', ['active', 'past_due'])
      .gt('current_period_end', new Date().toISOString())
      .limit(10);
    if (liveErr) return json({ error: 'subscriptions_unavailable', error_code: 'NO_SUBSCRIPTIONS_TABLE' }, 503);
    const same = (live ?? []).find((s) => (s as { tier?: unknown }).tier === offer.tier) as { current_period_end?: string } | undefined;
    if (same) {
      return json({ error: 'already_subscribed', error_code: 'BOG_ALREADY_SUBSCRIBED', activeUntil: same.current_period_end ?? null }, 409);
    }
    row = { kind: 'subscription', amount_gel: offer.amountGel, credits: offer.credits, tier: offer.tier };
    productId = `plan-${offer.tier}`;
    description = `MyAvatar ${TIERS[offer.tier].names.en} — 1 month`;
  } else {
    return json({ error: "kind must be 'topup' or 'plan'", error_code: 'BAD_KIND' }, 400);
  }

  const shopOrderId = newBogOrderId(isPlan ? 'plan' : 'topup');
  const { error: insertErr } = await svc
    .from('bog_orders')
    .insert({ shop_order_id: shopOrderId, user_id: userId, status: 'pending', locale, ...row });
  if (insertErr) return json({ error: 'order_mapping_unavailable', error_code: 'BOG_ORDER_ROW' }, 503);

  // ⚠️ SAY WHY. A refused order used to leave only `init_failed`, so four Production checkouts (2026-10-03…06) failed
  // with no trace of the cause. The reason (BOG's OAuth or order answer — never a secret) goes on the row and the log.
  let initFailure = 'unknown';
  const markInitFailed = () => {
    const reason = `init (${cfg.environment}): ${initFailure}`.slice(0, 200);
    // eslint-disable-next-line no-console
    console.error(`[bog checkout] order ${shopOrderId} not created — ${reason}`);
    return svc
      .from('bog_orders')
      .update({ status: 'init_failed', reject_reason: reason, updated_at: new Date().toISOString() })
      .eq('shop_order_id', shopOrderId)
      .then(() => undefined, () => undefined);
  };

  const origin = request.nextUrl.origin;
  const back = (outcome: 'success' | 'failed') =>
    `${origin}/${locale}/dashboard?bog=${encodeURIComponent(shopOrderId)}&pay=${outcome}`;
  const deps = { fetch };
  const order = await createBogOrder(cfg, deps, {
    externalOrderId: shopOrderId,
    amountGel: Number(row.amount_gel),
    productId,
    description,
    callbackUrl: bogCallbackUrl(origin),
    successUrl: back('success'),
    failUrl: back('failed'),
    locale,
    ttlMinutes: 30,
    cardOnly: isPlan,
  }, (failure) => {
    initFailure = failure;
  });
  if (!order) {
    await markInitFailed();
    return json({ error: 'bog_order_failed', error_code: 'BOG_ORDER' }, 502);
  }

  // Bind BOG's id now: a callback (or the return page) may carry only that id.
  await svc
    .from('bog_orders')
    .update({ bog_order_id: order.orderId, updated_at: new Date().toISOString() })
    .eq('shop_order_id', shopOrderId)
    .then(() => undefined, () => undefined);

  let autoRenew: boolean | undefined;
  if (isPlan) {
    // Ask BOG to keep the card for next month's charge — BEFORE the redirect, or there is nothing to save. If the
    // merchant is not (yet) enabled for automatic payments this fails, and the plan is sold as one month that simply
    // ends: the customer still gets what they paid for; nothing is ever charged without a saved card.
    autoRenew = await saveCardForAutomaticPayments(cfg, deps, order.orderId);
    if (!autoRenew) {
      // eslint-disable-next-line no-console
      console.warn(`[bog checkout] save-card refused for ${shopOrderId} — plan will not auto-renew (ask BOG to enable automatic payments)`);
    }
    await svc
      .from('bog_orders')
      .update({ card_saved: autoRenew, updated_at: new Date().toISOString() })
      .eq('shop_order_id', shopOrderId)
      .then(() => undefined, () => undefined);
  }

  return json({ redirectUrl: order.redirectUrl, orderId: shopOrderId, ...(isPlan ? { autoRenew } : {}) });
}
