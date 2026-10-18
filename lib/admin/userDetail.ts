/**
 * lib/admin/userDetail.ts — one customer, as the admin panel's user drawer shows them, and the four things an admin
 * can do to them: add or take credits, give back the credits of one charge, and put them on a package.
 *
 * Server-only, service-role client, called ONLY from an isAdmin()-gated route (nothing here re-checks admin).
 * Every write refuses on an unisolated Preview (lib/env/previewIsolation): a Preview shares Production's database.
 *
 * ⚠️ BALANCES MOVE ONLY THROUGH credit_ledger. The AFTER INSERT trigger applies a row's delta to
 * profiles.credits_balance; writing the balance directly would pay twice (20260802b_fix_double_credit.sql). A take goes
 * through deduct_credits (row lock, never below zero), a give-back through refund_credits (idempotent on its ref).
 *
 * ⚠️ A REFUND HERE IS CREDITS, NOT MONEY. Returning lari to a card is a BOG refund, which the owner decides per order;
 * the drawer lists the orders and says so, and never calls BOG.
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { paidWritesBlockedOnPreview, PREVIEW_NOT_ISOLATED } from '@/lib/env/previewIsolation';
import { historyActionFor, type HistoryAction } from '@/lib/billing/creditHistory';
import { resolveUserTierDetailed, type TierSource } from '@/lib/billing/resolveTier';
import { monthlyAllowanceCredits, isPaidTierId, type TierId } from '@/lib/billing/tiers';
import { MAX_GRANT } from './users';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export const LEDGER_PAGE = 100;

export interface AdminLedgerEntry {
  id: string;
  delta: number;
  reason: string;
  action: HistoryAction;
  ref: string;
  createdAt: string;
  /** A spend that has not been given back yet (by the pipeline's own refund or by an admin). */
  refundable: boolean;
  /** A give-back already exists for this spend. */
  refunded: boolean;
}

export interface AdminPayment {
  id: string;
  rail: 'bog' | 'wallet';
  kind: string;
  status: string;
  amountGel: number;
  credits: number | null;
  createdAt: string;
}

export interface AdminUserDetail {
  id: string;
  email: string | null;
  fullName: string | null;
  createdAt: string | null;
  balance: number;
  tier: TierId;
  tierSource: TierSource;
  /** The comp value in profiles.tier as stored (FREE / STARTER / CREATOR / BUSINESS / legacy PRO…), null when unread. */
  compTier: string | null;
  ledger: AdminLedgerEntry[];
  payments: AdminPayment[];
  generations: number | null;
}

export interface WriteResult {
  ok: boolean;
  newBalance: number | null;
  error?: string;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};

function refOf(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const ref = (metadata as { ref?: unknown }).ref;
  return typeof ref === 'string' ? ref : '';
}

/**
 * The refs that would mean "this spend was already given back". The pipelines use both conventions: some refund
 * under the spend's own ref (refund_credits is idempotent on delta > 0, so the pair shares a ref), most under
 * `<ref>:refund`. Either one closes the spend.
 */
export function refundRefsFor(ref: string): string[] {
  return ref ? [ref, `${ref}:refund`] : [];
}

/** Mark which spends on this page are still refundable. Pure, so the rule is testable without a database. */
export function markRefunds(rows: readonly { id: string; delta: number; ref: string }[]): Map<string, { refundable: boolean; refunded: boolean }> {
  const positiveRefs = new Set(rows.filter((r) => r.delta > 0 && r.ref).map((r) => r.ref));
  const out = new Map<string, { refundable: boolean; refunded: boolean }>();
  for (const r of rows) {
    if (r.delta >= 0 || !r.ref) {
      out.set(r.id, { refundable: false, refunded: false });
      continue;
    }
    const refunded = refundRefsFor(r.ref).some((x) => positiveRefs.has(x));
    out.set(r.id, { refundable: !refunded, refunded });
  }
  return out;
}

/** Read one customer for the drawer. Fail-soft per source: an unreadable table empties its section, never the drawer. */
export async function getUserDetail(client: Client, userId: string): Promise<AdminUserDetail | null> {
  const { data: profile, error } = await client
    .from('profiles')
    .select('id, email, full_name, credits_balance, created_at, tier')
    .eq('id', userId)
    .maybeSingle();
  if (error || !profile) return null;
  const p = profile as Record<string, unknown>;

  const [ledgerRes, bogRes, topupRes, gensRes, tierRes] = await Promise.all([
    client.from('credit_ledger').select('id, delta, reason, metadata, created_at').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(LEDGER_PAGE),
    client.from('bog_orders').select('shop_order_id, kind, status, amount_gel, credits, created_at').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(50),
    client.from('wallet_topups').select('ref, amount_gel, created_at').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(50),
    client.from('generation_jobs').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    resolveUserTierDetailed(client, userId).catch(() => ({ tier: 'free' as TierId, source: 'default' as TierSource })),
  ]);

  const raw = ((ledgerRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    delta: Math.trunc(num(r.delta)),
    reason: typeof r.reason === 'string' ? r.reason : '',
    ref: refOf(r.metadata),
    metadata: r.metadata,
    createdAt: String(r.created_at ?? ''),
  }));
  const marks = markRefunds(raw);
  const ledger: AdminLedgerEntry[] = raw.map((r) => ({
    id: r.id,
    delta: r.delta,
    reason: r.reason,
    action: historyActionFor({ delta: r.delta, reason: r.reason, metadata: r.metadata }),
    ref: r.ref,
    createdAt: r.createdAt,
    ...(marks.get(r.id) ?? { refundable: false, refunded: false }),
  }));

  // A BOG top-up is ALSO a wallet_topups row (ref bog:<order>); list it once, from the order.
  const bogOrders = (bogRes.data ?? []) as Record<string, unknown>[];
  const bogIds = new Set(bogOrders.map((o) => `bog:${String(o.shop_order_id)}`));
  const payments: AdminPayment[] = [
    ...bogOrders.map((o) => ({
      id: String(o.shop_order_id),
      rail: 'bog' as const,
      kind: typeof o.kind === 'string' ? o.kind : 'topup',
      status: typeof o.status === 'string' ? o.status : '',
      amountGel: num(o.amount_gel),
      credits: o.credits == null ? null : Math.trunc(num(o.credits)),
      createdAt: String(o.created_at ?? ''),
    })),
    ...((topupRes.data ?? []) as Record<string, unknown>[])
      .filter((t) => !bogIds.has(String(t.ref)))
      .map((t) => ({
        id: String(t.ref),
        rail: 'wallet' as const,
        kind: 'topup',
        status: 'completed',
        amountGel: num(t.amount_gel),
        credits: null,
        createdAt: String(t.created_at ?? ''),
      })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    id: String(p.id),
    email: (p.email as string | null) ?? null,
    fullName: (p.full_name as string | null) ?? null,
    createdAt: (p.created_at as string | null) ?? null,
    balance: Math.trunc(num(p.credits_balance)),
    tier: tierRes.tier,
    tierSource: tierRes.source,
    compTier: typeof p.tier === 'string' ? p.tier : null,
    ledger,
    payments,
    generations: typeof gensRes.count === 'number' ? gensRes.count : null,
  };
}

async function balanceOf(client: Client, userId: string): Promise<number | null> {
  const { data } = await client.from('profiles').select('credits_balance').eq('id', userId).maybeSingle();
  return data ? Math.trunc(num((data as { credits_balance?: unknown }).credits_balance)) : null;
}

/**
 * Add (delta > 0) or take (delta < 0) credits by user id. |delta| ≤ MAX_GRANT. A take uses deduct_credits, which
 * locks the balance row and refuses to go below zero, so a take can never race a spend into a negative wallet.
 */
export async function adjustUserCredits(client: Client, userId: string, delta: number, actorId: string, note?: string): Promise<WriteResult> {
  if (paidWritesBlockedOnPreview()) return { ok: false, newBalance: null, error: PREVIEW_NOT_ISOLATED };
  const amt = Math.trunc(Number(delta));
  if (!userId || !Number.isFinite(amt) || amt === 0 || Math.abs(amt) > MAX_GRANT) {
    return { ok: false, newBalance: null, error: 'invalid_amount' };
  }
  try {
    const current = await balanceOf(client, userId);
    if (current === null) return { ok: false, newBalance: null, error: 'user_not_found' };
    const ref = `admin:adjust:${randomUUID()}`;
    if (amt < 0) {
      const { data, error } = await client.rpc('deduct_credits', { p_user_id: userId, p_amount: -amt, p_ref: ref });
      if (error) {
        if ((error.message || '').toLowerCase().includes('insufficient')) return { ok: false, newBalance: current, error: 'insufficient_balance' };
        return { ok: false, newBalance: null, error: error.message || 'adjust_failed' };
      }
      return { ok: true, newBalance: Math.trunc(num(data)) };
    }
    const { error } = await client.from('credit_ledger').insert({
      user_id: userId,
      delta: amt,
      reason: 'admin_adjustment',
      metadata: { source: 'admin_panel', actor: actorId, ref, ...(note ? { note: note.slice(0, 200) } : {}) },
    });
    if (error) return { ok: false, newBalance: null, error: error.message };
    return { ok: true, newBalance: await balanceOf(client, userId) };
  } catch (e) {
    return { ok: false, newBalance: null, error: e instanceof Error ? e.message : 'adjust_failed' };
  }
}

/**
 * Give back the credits of ONE spend. Refused when the row is not this user's spend, has no ref (nothing to key the
 * give-back on), or was already given back under either refund convention. refund_credits under `<ref>:refund` is
 * idempotent, so a double press books one row.
 */
export async function refundLedgerEntry(client: Client, userId: string, ledgerId: string, actorId: string): Promise<WriteResult> {
  if (paidWritesBlockedOnPreview()) return { ok: false, newBalance: null, error: PREVIEW_NOT_ISOLATED };
  if (!userId || !ledgerId) return { ok: false, newBalance: null, error: 'invalid_request' };
  try {
    const { data: row } = await client.from('credit_ledger').select('id, user_id, delta, metadata').eq('id', ledgerId).maybeSingle();
    const r = row as { user_id?: string; delta?: unknown; metadata?: unknown } | null;
    if (!r || r.user_id !== userId) return { ok: false, newBalance: null, error: 'not_found' };
    const delta = Math.trunc(num(r.delta));
    const ref = refOf(r.metadata);
    if (delta >= 0 || !ref) return { ok: false, newBalance: null, error: 'not_refundable' };

    const { data: back } = await client.from('credit_ledger').select('id').eq('user_id', userId).gt('delta', 0)
      .in('metadata->>ref', refundRefsFor(ref)).limit(1);
    if (Array.isArray(back) && back.length > 0) return { ok: false, newBalance: await balanceOf(client, userId), error: 'already_refunded' };

    const { data, error } = await client.rpc('refund_credits', { p_user_id: userId, p_amount: -delta, p_ref: `${ref}:refund` });
    if (error) return { ok: false, newBalance: null, error: error.message || 'refund_failed' };
    // refund_credits stamps source 'orchestrator-rollback'; the operator is on the ops log.
    console.info(JSON.stringify({ ops_marker: 'admin_credit_refund', actor: actorId, user: userId, ledger: ledgerId, credits: -delta, ref }));
    return { ok: true, newBalance: Math.trunc(num(data)) };
  } catch (e) {
    return { ok: false, newBalance: null, error: e instanceof Error ? e.message : 'refund_failed' };
  }
}

/** The profiles.tier comp value for a catalogue tier (resolveTier maps these back). */
export const COMP_TIER_VALUE: Readonly<Record<TierId, string>> = {
  free: 'FREE', starter: 'STARTER', creator: 'CREATOR', business: 'BUSINESS',
};

/**
 * Put a customer on a package by hand (a comp): profiles.tier, which resolveTier reads when no paid subscription is
 * running. With `grantAllowance`, also books that package's monthly credits once, through grant_subscription_allowance
 * under an `admin:` invoice id (so dashboards can tell a comp from a sale). No subscriptions row is written: nothing
 * renews and nothing is charged.
 */
export async function assignUserPlan(
  client: Client,
  userId: string,
  tier: TierId,
  opts: { grantAllowance: boolean; actorId: string },
): Promise<WriteResult & { granted?: number }> {
  if (paidWritesBlockedOnPreview()) return { ok: false, newBalance: null, error: PREVIEW_NOT_ISOLATED };
  if (!userId || !(tier in COMP_TIER_VALUE)) return { ok: false, newBalance: null, error: 'invalid_tier' };
  try {
    const { data: upd, error } = await client.from('profiles').update({ tier: COMP_TIER_VALUE[tier] }).eq('id', userId).select('id');
    if (error) return { ok: false, newBalance: null, error: error.message };
    if (!Array.isArray(upd) || upd.length === 0) return { ok: false, newBalance: null, error: 'user_not_found' };

    let granted = 0;
    if (opts.grantAllowance && isPaidTierId(tier)) {
      const credits = monthlyAllowanceCredits(tier);
      const { error: gErr } = await client.rpc('grant_subscription_allowance', {
        p_user_id: userId,
        p_invoice_id: `admin:${randomUUID()}`,
        p_tier: tier,
        p_credits: credits,
        p_subscription_id: null,
        p_customer_id: null,
        p_price_id: null,
        p_period_start: null,
        p_period_end: null,
      });
      if (gErr) return { ok: false, newBalance: await balanceOf(client, userId), error: `tier_set_but_grant_failed: ${gErr.message}` };
      granted = credits;
    }
    console.info(JSON.stringify({ ops_marker: 'admin_assign_plan', actor: opts.actorId, user: userId, tier, granted }));
    return { ok: true, newBalance: await balanceOf(client, userId), granted };
  } catch (e) {
    return { ok: false, newBalance: null, error: e instanceof Error ? e.message : 'assign_failed' };
  }
}
