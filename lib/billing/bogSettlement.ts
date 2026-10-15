/**
 * lib/billing/bogSettlement.ts — turn a Bank of Georgia receipt into credits, exactly once.
 *
 * Three callers settle orders, and may race on the same one:
 *   · the signed callback        app/api/billing/bog/webhook        (BOG documents NO retry for a failed callback)
 *   · the return page            app/api/billing/bog/orders/[id]    (the customer just came back from the bank)
 *   · the cron                   app/api/cron/bog-billing           (every pending order, then every due renewal)
 * They all end in settleBogOrder, and money moves only through the bog_fulfill_order RPC — one transaction under
 * the order's row lock, idempotent on our order id — so the race is harmless.
 *
 * ⚠️ THE AMOUNT CREDITED IS OURS, NEVER THE RECEIPT'S. A receipt only decides WHETHER an order is paid; what it is
 * worth comes from the row we wrote at checkout. A receipt whose amount, currency or ids disagree with that row is
 * flagged `amount_mismatch` and credits nothing — that needs a human, not a guess.
 */
import 'server-only';
import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BOG_RESPONSE_CODES, deleteSavedCard, getBogReceipt, type BogConfig, type BogEnvironment, type BogFetchDeps, type BogReceipt } from './bogClient';
import { fulfillBogOrder, recordBogRenewalFailure } from './wallet-ledger';

export type BogOrderKind = 'topup' | 'subscription' | 'renewal';

export interface BogOrderRow {
  shop_order_id: string;
  bog_order_id: string | null;
  user_id: string;
  amount_gel: number | string;
  status: string;
  kind: BogOrderKind;
  tier: string | null;
  credits: number | null;
  subscription_id: string | null;
  card_saved: boolean | null;
  period_end?: string | null;
  created_at?: string;
}

export const BOG_ORDER_COLUMNS =
  'shop_order_id,bog_order_id,user_id,amount_gel,status,kind,tier,credits,subscription_id,card_saved,period_end,created_at';

export type SettleOutcome =
  | {
      status: 'completed';
      granted: boolean;
      kind: BogOrderKind;
      credits: number;
      tier: string | null;
      periodEnd: string | null;
      autoRenew: boolean | null;
    }
  | { status: 'pending' }
  | { status: 'rejected'; reason: string | null }
  | { status: BogRefundStatus; refundAmountGel: number | null }
  | { status: 'mismatch'; reason: string }
  | { status: 'error'; reason: string };

type Db = Pick<SupabaseClient, 'from'>;

/**
 * BOG's refund statuses, in the order a refund moves through them; each is also what we write on our row. They are
 * bookkeeping only: the refund policy is unchanged — credits already granted are NOT clawed back (they may be spent),
 * the owner adjusts a balance by hand. Our row only ever moves forward along completed → … → refunded, so a late or
 * repeated message can never pull it back. One exception: refund_requested returns to completed when BOG's receipt
 * shows the refund was rejected and nothing went back (rejectedRefundReason).
 */
export const BOG_REFUND_STATUSES = ['refund_requested', 'refunded_partially', 'refunded'] as const;
export type BogRefundStatus = (typeof BOG_REFUND_STATUSES)[number];
const REFUND_PATH = ['completed', ...BOG_REFUND_STATUSES] as const;
/** Where a status sits on completed → refund_requested → refunded_partially → refunded; -1 when not on it. */
const refundStep = (status: string): number => (REFUND_PATH as readonly string[]).indexOf(status);

export function isBogRefundStatus(status: unknown): status is BogRefundStatus {
  return typeof status === 'string' && (BOG_REFUND_STATUSES as readonly string[]).includes(status);
}

/** Amounts are GEL with tetri — a cent of float noise must not read as a mismatch. */
const AMOUNT_EPSILON = 0.01;

/**
 * Did the refund fail? Only when the receipt lists refunds (actions[]), every one of them was rejected (e.g. 162, the
 * issuing bank declined it) and nothing went back (refund_amount 0). Then "refund_rejected <code> <description>",
 * else null. A replayed "completed" from before the refund lists no refund, so it never qualifies.
 */
export function rejectedRefundReason(receipt: BogReceipt): string | null {
  const refunds = receipt.refundActions ?? [];
  if (!refunds.length || refunds.some((a) => a.status !== 'rejected')) return null;
  if ((receipt.refundAmount ?? 0) > AMOUNT_EPSILON) return null;
  const last = refunds[refunds.length - 1]!;
  const description = last.codeDescription ?? (last.code ? BOG_RESPONSE_CODES[last.code] : undefined) ?? null;
  return ['refund_rejected', last.code, description].filter(Boolean).join(' ').slice(0, 200);
}

/** Find our order by our id first (immutable, server-minted), then by BOG's. null when unknown or unreadable. */
export async function loadBogOrder(db: Db, ref: { shopOrderId?: string | null; bogOrderId?: string | null }): Promise<BogOrderRow | null> {
  try {
    if (ref.shopOrderId) {
      const { data } = await db.from('bog_orders').select(BOG_ORDER_COLUMNS).eq('shop_order_id', ref.shopOrderId).maybeSingle();
      if (data) return data as unknown as BogOrderRow;
    }
    if (ref.bogOrderId) {
      const { data } = await db.from('bog_orders').select(BOG_ORDER_COLUMNS).eq('bog_order_id', ref.bogOrderId).maybeSingle();
      if (data) return data as unknown as BogOrderRow;
    }
  } catch {
    /* unreadable → unknown; the caller credits nothing */
  }
  return null;
}

async function markOrder(db: Db, order: BogOrderRow, patch: Record<string, unknown>, onlyIfStatus?: string | readonly string[]): Promise<void> {
  try {
    let q = db.from('bog_orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('shop_order_id', order.shop_order_id);
    if (typeof onlyIfStatus === 'string') q = q.eq('status', onlyIfStatus);
    else if (onlyIfStatus) q = q.in('status', [...onlyIfStatus]);
    await q;
  } catch {
    /* bookkeeping only — money never depends on this write */
  }
}

/**
 * Was the card saved for automatic payments on this (plan) order? BOG says so in `saved_card_type`; older receipts
 * may omit it, in which case we trust our own save-card request (card_saved) — but only for a card payment, since
 * Apple Pay / internet-bank payments leave nothing to charge next month.
 */
export function cardSavedForRenewals(order: BogOrderRow, receipt: BogReceipt): boolean {
  if (order.kind !== 'subscription') return false;
  if (receipt.savedCardType) return receipt.savedCardType === 'subscription';
  return order.card_saved === true && receipt.transferMethod === 'card';
}

/**
 * Settle one order against a receipt (a verified callback body, or GET /receipt). Idempotent.
 * `opts.cfg/deps` let it delete the saved cards of plans this purchase replaced; without them that step is skipped.
 */
export async function settleBogOrder(
  db: Db,
  order: BogOrderRow,
  receipt: BogReceipt,
  opts: { cfg?: BogConfig; deps?: BogFetchDeps } = {},
): Promise<SettleOutcome> {
  // The receipt must be about THIS order: our id (when BOG echoes it) and BOG's id (once we have bound one).
  if (receipt.externalOrderId && receipt.externalOrderId !== order.shop_order_id) {
    return { status: 'mismatch', reason: 'external_order_id' };
  }
  if (order.bog_order_id && receipt.orderId !== order.bog_order_id) {
    return { status: 'mismatch', reason: 'order_id' };
  }

  switch (receipt.state) {
    case 'completed': {
      if (isBogRefundStatus(order.status)) {
        const refundRejected = order.status === 'refund_requested' ? rejectedRefundReason(receipt) : null;
        if (refundRejected) {
          // The refund we recorded failed and nothing went back: the payment stands, so the row returns to completed
          // with BOG's reason. Status only: nothing is fulfilled or credited again (it was credited once, before).
          // eslint-disable-next-line no-console
          console.warn(`[bog] order ${order.shop_order_id}: BOG rejected the refund (${refundRejected}) — back to completed, credits unchanged`);
          await markOrder(db, order, { status: 'completed', reject_reason: refundRejected }, 'refund_requested');
          return {
            status: 'completed',
            granted: false,
            kind: order.kind,
            credits: Number(order.credits ?? 0),
            tier: order.tier,
            periodEnd: order.period_end ?? null,
            autoRenew: null,
          };
        }
        // We already heard of a refund, so this "completed" is older news (a late or replayed callback). The order was
        // credited once before the refund began; never fulfil it again or pull the row back to completed.
        // eslint-disable-next-line no-console
        console.warn(`[bog] order ${order.shop_order_id} is ${order.status} here but BOG sent completed — ignored, nothing re-credited`);
        return { status: order.status, refundAmountGel: null };
      }
      const amount = Number(order.amount_gel);
      const wrongCurrency = receipt.currency !== null && receipt.currency !== 'GEL';
      const wrongAmount = receipt.requestAmount !== null && Math.abs(receipt.requestAmount - amount) > AMOUNT_EPSILON;
      const shortPaid = receipt.transferAmount !== null && receipt.transferAmount + AMOUNT_EPSILON < amount;
      if (!Number.isFinite(amount) || wrongCurrency || wrongAmount || shortPaid) {
        const reason = wrongCurrency ? 'currency' : wrongAmount ? 'amount' : shortPaid ? 'partial_payment' : 'bad_row';
        // eslint-disable-next-line no-console
        console.error(
          `[bog] PAID ORDER NOT CREDITED (${reason}) order=${order.shop_order_id} recorded=${order.amount_gel}GEL ` +
            `receipt=${receipt.requestAmount ?? '?'}/${receipt.transferAmount ?? '?'} ${receipt.currency ?? ''} — needs review`,
        );
        if (order.status !== 'completed') await markOrder(db, order, { status: 'amount_mismatch', reject_reason: reason });
        return { status: 'mismatch', reason };
      }
      const f = await fulfillBogOrder({
        shopOrderId: order.shop_order_id,
        bogOrderId: receipt.orderId,
        cardMask: receipt.cardMask,
        cardSaved: cardSavedForRenewals(order, receipt),
      });
      if (!f) return { status: 'error', reason: 'fulfill_failed' };
      if (f.supersededParentOrders.length && opts.cfg && opts.deps) {
        const { cfg, deps } = opts;
        await Promise.allSettled(f.supersededParentOrders.map((id) => deleteSavedCard(cfg, deps, id)));
      }
      return { status: 'completed', granted: f.granted, kind: f.kind, credits: f.credits, tier: f.tier, periodEnd: f.periodEnd, autoRenew: f.autoRenew };
    }

    case 'rejected': {
      const reason = receipt.rejectReason ?? (receipt.code ? `code_${receipt.code}` : null);
      if (order.kind === 'renewal') {
        await recordBogRenewalFailure(order.shop_order_id, reason ?? 'rejected');
      } else {
        await markOrder(db, order, { status: 'rejected', reject_reason: reason, bog_order_id: order.bog_order_id ?? receipt.orderId }, 'pending');
      }
      return { status: 'rejected', reason };
    }

    case 'refund_requested':
    case 'refunded_partially':
    case 'refunded': {
      // Refunds are made by the owner in BOG's business manager. Bookkeeping only (see BOG_REFUND_STATUSES): credits
      // already granted are not reversed; the log line is the cue to adjust the balance by hand.
      const next = receipt.state;
      const amount = receipt.refundAmount;
      const step = refundStep(order.status);
      if (step < 0) {
        // Never credited here (pending, rejected, expired, amount_mismatch…): nothing to reverse, nothing to grant.
        // eslint-disable-next-line no-console
        console.warn(`[bog] order ${order.shop_order_id} (${order.status}, never credited) is ${next} at BOG — nothing changed, review in Business Manager`);
      } else if (step < refundStep(next)) {
        // eslint-disable-next-line no-console
        console.warn(
          `[bog] order ${order.shop_order_id} is ${next} at BOG (refund ${amount ?? '?'} of ${order.amount_gel} GEL) — ` +
            'credits were NOT reversed (refund policy unchanged)',
        );
        await markOrder(db, order, { status: next }, REFUND_PATH.slice(0, refundStep(next)));
      }
      return { status: next, refundAmountGel: amount };
    }

    default: {
      // created / processing / auth_requested — or a pre-authorisation state we never request. Nothing moves;
      // remember BOG's id so a later reconcile can ask about it.
      if (!order.bog_order_id) await markOrder(db, order, { bog_order_id: receipt.orderId }, 'pending');
      return { status: 'pending' };
    }
  }
}

/** Ask BOG for the order's receipt and settle it. pending when the order never reached BOG. */
export async function reconcileBogOrder(db: Db, cfg: BogConfig, deps: BogFetchDeps, order: BogOrderRow): Promise<SettleOutcome> {
  if (!order.bog_order_id) return { status: 'pending' };
  const receipt = await getBogReceipt(cfg, deps, order.bog_order_id);
  if (!receipt) return { status: 'error', reason: 'receipt_unavailable' };
  return settleBogOrder(db, order, receipt, { cfg, deps });
}

/**
 * Where BOG sends callbacks: the canonical site, else the request's own origin. Always https in production.
 * A SANDBOX order's callback goes to the request's own origin only — never the canonical (live) site.
 */
export function bogCallbackUrl(origin?: string | null, environment: BogEnvironment = 'production'): string {
  if (environment === 'sandbox') return `${(origin || '').replace(/\/+$/, '')}/api/billing/bog/webhook`;
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const base = site || origin || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return `${base.replace(/\/+$/, '')}/api/billing/bog/webhook`;
}

/**
 * ⚠️ A SANDBOX ORDER NEVER TOUCHES THE PRODUCTION DATABASE. Every hosted deployment — Production and every Preview —
 * writes to it, and a paid sandbox order settles like a real one: a test card would mint real credits. So sandbox
 * credentials only take orders where the database is not Production's (a local dev server, CI); on any Vercel
 * deployment BOG_ENV=sandbox closes the checkout (capabilities bog:false, checkout 503 BOG_SANDBOX_BLOCKED).
 */
export function bogSandboxBlocked(cfg: Pick<BogConfig, 'environment'> | null, env: NodeJS.ProcessEnv = process.env): boolean {
  return cfg?.environment === 'sandbox' && Boolean((env.VERCEL_ENV || env.VERCEL || '').trim());
}

/**
 * Our id for a new checkout order. The first 25 characters are printed on the payer's bank statement
 * ("myavatar-topup-3f9a1c0b2e"); renewal ids are minted by bog_claim_renewal in SQL ('myavatar-renew-…').
 */
export function newBogOrderId(kind: 'topup' | 'plan'): string {
  return `myavatar-${kind}-${randomBytes(8).toString('hex')}`;
}

/** A shape check for ids arriving in URLs — never query the table with arbitrary input. */
export function isBogOrderId(id: unknown): id is string {
  return typeof id === 'string' && /^myavatar-(topup|plan|renew)-[a-z0-9-]{8,64}$/.test(id);
}

/**
 * Is migration 20261002a in this database? Probed once per instance (5 min cache, 30 s after a miss) by reading a
 * column only it adds. Gates the "Pay with Bank of Georgia" offer: credentials set before the migration would
 * otherwise show a button whose every checkout fails (safely — no order row, no order — but visibly).
 */
let schemaProbe: { at: number; ready: boolean } | null = null;
export async function bogSchemaReady(db: Db, now: number = Date.now()): Promise<boolean> {
  if (schemaProbe && now - schemaProbe.at < (schemaProbe.ready ? 300_000 : 30_000)) return schemaProbe.ready;
  let ready = false;
  try {
    const { error } = await db.from('bog_orders').select('kind').limit(1);
    ready = !error;
  } catch {
    ready = false;
  }
  schemaProbe = { at: now, ready };
  return ready;
}

/** Test hook. */
export function resetBogSchemaProbe(): void {
  schemaProbe = null;
}
