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
import { deleteSavedCard, getBogReceipt, type BogConfig, type BogFetchDeps, type BogReceipt } from './bogClient';
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
  | { status: 'refunded' }
  | { status: 'mismatch'; reason: string }
  | { status: 'error'; reason: string };

type Db = Pick<SupabaseClient, 'from'>;

/** Amounts are GEL with tetri — a cent of float noise must not read as a mismatch. */
const AMOUNT_EPSILON = 0.01;

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

async function markOrder(db: Db, order: BogOrderRow, patch: Record<string, unknown>, onlyIfStatus?: string): Promise<void> {
  try {
    let q = db.from('bog_orders').update({ ...patch, updated_at: new Date().toISOString() }).eq('shop_order_id', order.shop_order_id);
    if (onlyIfStatus) q = q.eq('status', onlyIfStatus);
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

    case 'refunded': {
      // Refunds are made by the owner in BOG's business manager. Bookkeeping only — credits already granted are not
      // clawed back automatically (they may be spent); the log line is the cue to adjust the balance by hand.
      if (order.status === 'completed') {
        // eslint-disable-next-line no-console
        console.warn(`[bog] order ${order.shop_order_id} was REFUNDED at BOG (${receipt.statusKey}) — credits were not reversed`);
        await markOrder(db, order, { status: 'refunded' }, 'completed');
      }
      return { status: 'refunded' };
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

/** Where BOG sends callbacks: the canonical site, else the request's own origin. Always https in production. */
export function bogCallbackUrl(origin?: string | null): string {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim();
  const base = site || origin || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  return `${base.replace(/\/+$/, '')}/api/billing/bog/webhook`;
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
