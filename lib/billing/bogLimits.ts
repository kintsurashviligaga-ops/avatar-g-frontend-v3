/**
 * lib/billing/bogLimits.ts — Bank of Georgia's payment limits, enforced before an order reaches the bank.
 *
 * The bank's activation letter (2026-10-12) limits this merchant to 500 ₾ per payment, 1,000 ₾ per 24 hours and
 * 5,000 ₾ per 30 days. Above them BOG declines the card on its own page: no money moves, but the customer gets a
 * bank error with no explanation. So the checkout (and the renewal cron) asks here first and says plainly when a
 * limit is reached and when there is room again.
 *
 * The bank's answers of 2026-10-15: the 1,000 ₾ and 5,000 ₾ are totals on OUR side (merchant-wide), counted in
 * CALENDAR days — the day runs from midnight to midnight Georgian time, the month is "30 calendar days" — and
 * automatic renewals count in them too; the 500 ₾ is per payment, per cardholder; a refund does NOT give room back.
 * We keep rolling windows on purpose: a rolling 24 h window always holds everything paid since the last midnight,
 * and a rolling 30 × 24 h one everything since midnight 29 days ago, in any time zone without daylight saving
 * (Georgia's and UTC have none). So nothing we admit can break the bank's calendar limits; the cost is that we
 * sometimes wait longer than the bank would, at most until the same hour the next day (bogLimits.test.ts proves both).
 *
 *   bogLimits(env)       the limits in force: the letter's figures, raised or lowered without a deploy of code by
 *                        BOG_LIMIT_PER_PAYMENT_GEL / BOG_LIMIT_24H_GEL / BOG_LIMIT_30D_GEL (an unreadable value
 *                        keeps the letter's figure), and the scope, BOG_LIMIT_SCOPE:
 *                          merchant (default) — every customer's payments together: the bank's rule (2026-10-15);
 *                          customer           — each customer separately. NOT the bank's rule: it would let the
 *                                               merchant total pass the limits. Kept only for a bank-approved change.
 *   checkBogLimits(db)   would `amountGel` more fit? Counts, inside rolling 24 h / 30 day windows:
 *                          · paid orders (completed, refunds, amount_mismatch — PAID_STATUSES), timed by when they
 *                            were credited, else made — in scope (everyone's, or this customer's);
 *                          · this customer's own checkout orders still payable on BOG's page (pending, younger than
 *                            the page's lifetime + a grace period). Only their own: counting everyone's open
 *                            checkouts would let one customer block the rail for all by opening and abandoning them.
 *                        Fails closed: an unreadable table, or more rows than it reads, answers 'unknown'.
 *
 * Concurrency: the checkout checks, writes its pending row, then checks again with that row counted (amount 0).
 * Each PostgREST call is its own transaction, so of two racing checkouts by one customer the later re-check always
 * sees both rows: they can never both pass. Racing customers in merchant scope can overshoot by one order each;
 * BOG then declines the extra payment on its page, which moves no money.
 */
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BOG_LIMITS_GEL } from './bogCatalog';

type Db = Pick<SupabaseClient, 'from'>;

export type BogLimitScope = 'merchant' | 'customer';
export interface BogLimits {
  singleTransaction: number;
  per24h: number;
  per30d: number;
  scope: BogLimitScope;
}

/**
 * Statuses whose money reached the bank: completed, BOG_REFUND_STATUSES (bogSettlement; bogLimits.test.ts pins the
 * two lists together) and amount_mismatch. A refunded payment still counts — the bank confirmed on 2026-10-15 that a
 * refund does not free room in the limits — and an amount_mismatch order was paid but not credited.
 */
export const BOG_PAID_STATUSES = ['completed', 'refund_requested', 'refunded_partially', 'refunded', 'amount_mismatch'] as const;

/** How long BOG's payment page lives for a checkout order (ttl on POST /ecommerce/orders). */
export const BOG_CHECKOUT_TTL_MINUTES = 30;
/** A checkout still pending this long after it was made can no longer be paid: the page expired, plus 3-D Secure grace. */
export const BOG_IN_FLIGHT_MS = (BOG_CHECKOUT_TTL_MINUTES + 15) * 60_000;

const DAY_MS = 86_400_000;
/** 5,000 ₾ / 30 days at a 5 ₾ order is 1,000 orders; reading more than this answers 'unknown' rather than guess. */
const ROWS_MAX = 2_000;
const MAX_SANE_GEL = 1_000_000;

function gelFromEnv(raw: string | undefined, fallback: number): number {
  const s = (raw ?? '').trim();
  const v = Number(s);
  return s && Number.isFinite(v) && v > 0 && v <= MAX_SANE_GEL ? v : fallback;
}

export function bogLimits(env: NodeJS.ProcessEnv = process.env): BogLimits {
  return {
    singleTransaction: gelFromEnv(env.BOG_LIMIT_PER_PAYMENT_GEL, BOG_LIMITS_GEL.singleTransaction),
    per24h: gelFromEnv(env.BOG_LIMIT_24H_GEL, BOG_LIMITS_GEL.per24h),
    per30d: gelFromEnv(env.BOG_LIMIT_30D_GEL, BOG_LIMITS_GEL.per30d),
    scope: (env.BOG_LIMIT_SCOPE || '').trim().toLowerCase() === 'customer' ? 'customer' : 'merchant',
  };
}

export type BogLimitWindow = '24h' | '30d';
export type BogLimitCheck =
  | { ok: true; used24hGel: number; used30dGel: number }
  | {
      ok: false;
      window: BogLimitWindow;
      limitGel: number;
      usedGel: number;
      /** When enough of what is counted leaves the window for this amount to fit; null when it never can. */
      availableAt: string | null;
    }
  | { ok: false; window: 'unknown' };

/** One counted amount (in tetri, so sums never pick up float noise) and when it leaves each window. */
interface Counted {
  tetri: number;
  inside24h: boolean;
  inside30d: boolean;
  leaves24h: number;
  leaves30d: number;
}

const tetri = (gel: unknown): number => Math.round(Number(gel) * 100);

/**
 * Would `amountGel` more fit inside the limits? `amountGel` is an order not yet in the table; pass 0 to re-check after
 * writing it (its pending row is then counted as in flight). Never throws.
 */
export async function checkBogLimits(
  db: Db,
  opts: { userId: string; amountGel: number; limits?: BogLimits; nowMs?: number },
): Promise<BogLimitCheck> {
  const limits = opts.limits ?? bogLimits();
  const now = opts.nowMs ?? Date.now();
  const add = tetri(opts.amountGel);
  if (!Number.isFinite(add) || add < 0) return { ok: false, window: 'unknown' };
  const counted: Counted[] = [];
  try {
    // Orders settle within 48 h of being made (the cron expires the rest), so 31 days of orders covers 30 of payments.
    let paidQ = db
      .from('bog_orders')
      .select('amount_gel,created_at,credited_at')
      .in('status', [...BOG_PAID_STATUSES])
      .gte('created_at', new Date(now - 31 * DAY_MS).toISOString());
    if (limits.scope === 'customer') paidQ = paidQ.eq('user_id', opts.userId);
    const paid = await paidQ.order('created_at', { ascending: false }).limit(ROWS_MAX);
    if (paid.error || !Array.isArray(paid.data) || paid.data.length >= ROWS_MAX) return { ok: false, window: 'unknown' };
    for (const r of paid.data as Array<{ amount_gel: unknown; created_at: string; credited_at: string | null }>) {
      const at = Date.parse(r.credited_at || r.created_at);
      const t = tetri(r.amount_gel);
      if (!Number.isFinite(at) || !Number.isFinite(t)) return { ok: false, window: 'unknown' };
      counted.push({ tetri: t, inside24h: now - at <= DAY_MS, inside30d: now - at <= 30 * DAY_MS, leaves24h: at + DAY_MS, leaves30d: at + 30 * DAY_MS });
    }

    const open = await db
      .from('bog_orders')
      .select('amount_gel,created_at')
      .eq('user_id', opts.userId)
      .eq('status', 'pending')
      .in('kind', ['topup', 'subscription'])
      .gte('created_at', new Date(now - BOG_IN_FLIGHT_MS).toISOString())
      .limit(ROWS_MAX);
    if (open.error || !Array.isArray(open.data) || open.data.length >= ROWS_MAX) return { ok: false, window: 'unknown' };
    for (const r of open.data as Array<{ amount_gel: unknown; created_at: string }>) {
      const made = Date.parse(r.created_at);
      const t = tetri(r.amount_gel);
      if (!Number.isFinite(made) || !Number.isFinite(t)) return { ok: false, window: 'unknown' };
      // If it is paid it moves into the paid list (and stays counted); if not, it stops counting when the page dies.
      counted.push({ tetri: t, inside24h: true, inside30d: true, leaves24h: made + BOG_IN_FLIGHT_MS, leaves30d: made + BOG_IN_FLIGHT_MS });
    }
  } catch {
    return { ok: false, window: 'unknown' };
  }

  const verdict = (window: BogLimitWindow) => {
    const limit = tetri(window === '24h' ? limits.per24h : limits.per30d);
    const inside = counted.filter((c) => (window === '24h' ? c.inside24h : c.inside30d));
    const used = inside.reduce((s, c) => s + c.tetri, 0);
    if (used + add <= limit) return { used, refusal: null };
    let availableAt: string | null = null;
    if (add <= limit) {
      let freed = 0;
      for (const c of inside.sort((a, b) => (window === '24h' ? a.leaves24h - b.leaves24h : a.leaves30d - b.leaves30d))) {
        freed += c.tetri;
        if (used - freed + add <= limit) {
          availableAt = new Date(window === '24h' ? c.leaves24h : c.leaves30d).toISOString();
          break;
        }
      }
    }
    return { used, refusal: { ok: false as const, window, limitGel: limit / 100, usedGel: used / 100, availableAt } };
  };
  const d = verdict('24h');
  const m = verdict('30d');
  if (d.refusal && m.refusal) {
    // Both full: the customer can pay again only once both have room — report the later of the two.
    const later = (r: { availableAt: string | null }) => (r.availableAt === null ? Infinity : Date.parse(r.availableAt));
    return later(m.refusal) >= later(d.refusal) ? m.refusal : d.refusal;
  }
  if (d.refusal) return d.refusal;
  if (m.refusal) return m.refusal;
  return { ok: true, used24hGel: d.used / 100, used30dGel: m.used / 100 };
}
