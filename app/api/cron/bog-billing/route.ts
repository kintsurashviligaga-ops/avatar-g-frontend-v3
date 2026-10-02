/**
 * /api/cron/bog-billing — the Bank of Georgia safety net and renewal engine (vercel.json, every 10 minutes).
 *
 *   1. RECONCILE  every order still pending 3 min … 48 h after creation is settled from BOG's receipt. BOG documents
 *                 no callback retry, so this is what credits a payment whose callback was lost.
 *   2. EXPIRE     checkout orders pending for over 48 h (BOG's payment page lives ≤ 24 h) become `expired`. Not
 *                 terminal for money: a late callback still settles an expired order.
 *   3. RENEW      every renewing BOG plan whose period ends within the hour: claim the period (bog_claim_renewal —
 *                 one live order per period, so overlapping ticks cannot double-charge), charge the saved card
 *                 (POST …/subscribe, Idempotency-Key derived from the order id), and leave the result to the callback
 *                 or the next tick's reconcile. A declined charge backs off a day; three in a row → past_due.
 *
 * CRON_SECRET-gated (lib/api/cronAuth — refuses when the secret is unset). Inert until BOG_CLIENT_ID/SECRET are set.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/api/cronAuth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { reportError } from '@/lib/observability/report-error';
import { bogConfig, chargeSavedCard } from '@/lib/billing/bogClient';
import { BOG_ORDER_COLUMNS, bogCallbackUrl, reconcileBogOrder, type BogOrderRow } from '@/lib/billing/bogSettlement';
import { claimBogRenewal, recordBogRenewalFailure } from '@/lib/billing/wallet-ledger';
import { monthlyAllowanceCredits } from '@/lib/billing/tiers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const RECONCILE_BATCH = 50;
const RENEW_BATCH = 25;

async function handle(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const cfg = bogConfig();
  if (!cfg) return NextResponse.json({ ok: true, skipped: 'bog_unconfigured' });

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json({ ok: false, error: 'no_service_role' }, { status: 503 });
  }
  const deps = { fetch };
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
  const report = { reconciled: 0, completed: 0, rejected: 0, expired: 0, charged: 0, refused: 0, retryLater: 0, errors: 0 };

  try {
    // 1 ─ reconcile
    const { data: pending } = await svc
      .from('bog_orders')
      .select(BOG_ORDER_COLUMNS)
      .eq('status', 'pending')
      .not('bog_order_id', 'is', null)
      .lt('created_at', iso(3 * 60_000))
      .gt('created_at', iso(48 * 3600_000))
      .order('created_at', { ascending: true })
      .limit(RECONCILE_BATCH);
    for (const order of (pending ?? []) as unknown as BogOrderRow[]) {
      const outcome = await reconcileBogOrder(svc, cfg, deps, order);
      report.reconciled += 1;
      if (outcome.status === 'completed') report.completed += 1;
      else if (outcome.status === 'rejected') report.rejected += 1;
      else if (outcome.status === 'error') report.errors += 1;
    }

    // 2 ─ expire stale checkout orders (renewals are left for review: a charge may exist)
    const { data: expired } = await svc
      .from('bog_orders')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'pending')
      .in('kind', ['topup', 'subscription'])
      .lt('created_at', iso(48 * 3600_000))
      .select('shop_order_id');
    report.expired = (expired ?? []).length;

    // 3 ─ renewals
    const { data: due } = await svc
      .from('subscriptions')
      .select('id,tier')
      .eq('provider', 'bog')
      .in('status', ['active', 'past_due'])
      .eq('cancel_at_period_end', false)
      .not('bog_parent_order_id', 'is', null)
      .lt('renewal_failures', 3)
      .lte('current_period_end', new Date(now + 3600_000).toISOString())
      .order('current_period_end', { ascending: true })
      .limit(RENEW_BATCH);
    const callbackUrl = bogCallbackUrl();
    for (const sub of (due ?? []) as Array<{ id: string; tier: string | null }>) {
      const credits = monthlyAllowanceCredits(sub.tier);
      if (credits <= 0) continue;
      const claim = await claimBogRenewal(sub.id, credits);
      if (!claim) {
        report.errors += 1;
        continue;
      }
      // A fresh claim, or a claimed period whose charge request never got an answer (crash, timeout): charge — the
      // same order id means the same Idempotency-Key, so a charge that did go through is not repeated.
      const needsCharge = claim.claimed || (claim.reason === 'in_flight' && claim.status === 'pending' && !claim.bogOrderId);
      if (!needsCharge || !claim.shopOrderId || !claim.parentOrderId) continue;
      const result = await chargeSavedCard(cfg, deps, { parentOrderId: claim.parentOrderId, externalOrderId: claim.shopOrderId, callbackUrl });
      if (result.ok) {
        report.charged += 1;
        await svc
          .from('bog_orders')
          .update({ bog_order_id: result.orderId, updated_at: new Date().toISOString() })
          .eq('shop_order_id', claim.shopOrderId)
          .is('bog_order_id', null)
          .then(() => undefined, () => undefined);
      } else if (result.error === 'refused') {
        report.refused += 1;
        await recordBogRenewalFailure(claim.shopOrderId, `refused_${result.status}`);
      } else {
        report.retryLater += 1; // no answer — the next tick retries with the same key
      }
    }
  } catch (e) {
    reportError(e, { route: '/api/cron/bog-billing' });
    return NextResponse.json({ ok: false, ...report }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...report });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
