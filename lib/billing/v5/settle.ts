/**
 * lib/billing/v5/settle.ts — reserve the worst case, then settle what really happened (v5.1 Phase 5, M-5; PREPARED,
 * NOT WIRED).
 *
 * Over the CANONICAL ledger only (credit_ledger → profiles.credits_balance through the existing ref-idempotent RPCs that
 * lib/orchestrator/ledger wraps). It never touches the legacy public.credits ledger (B-02: untouched until GG's
 * 01_introspect.sql output), and it needs no new ledger RPC:
 *
 *   reserve   debit maxCredits once, ref `<ref>:hold`            (deductCreditsOnce: a replay is a no-op)
 *   settle    refund the unused part once, ref `<ref>:release`   (refundCredits: deduped on metadata->>'ref')
 *   cost      one provider_costs row per ref (what Google billed us, and whether it was our loss)
 *
 * Settlement rules (08 §5, GG D-15 "no charging users for Google-billed failures"):
 *   success                 the user pays the actual price, never above maxCredits; cost above the quote is our loss
 *   provider error, unbilled the user pays 0 (full release); cost 0
 *   provider error, billed  the user pays 0 (full release); what Google billed is recorded as OUR loss with its reason
 *   cancelled by the user   the user pays for the completed part only (≤ maxCredits)
 * Fail closed: no reservation → no provider call. A settle with no matching hold changes nothing.
 */
import { priceUsage, type Quote, type Usage } from './quote';
import type { PriceVersion } from './priceVersions';

export type Outcome =
  | { kind: 'success'; usage: Usage }
  | { kind: 'provider_error'; billed: false }
  | { kind: 'provider_error'; billed: true; billedUsage: Usage; reason: string }
  | { kind: 'cancelled'; completedUsage: Usage };

export interface Settlement {
  userCredits: number;
  releaseCredits: number;
  costUsd: number;
  lossUsd: number;
  lossReason: string | null;
}

/** Pure: what the user pays and what we record, for a hold of `q.maxCredits`. Prices actual usage at the QUOTE's time. */
export function settlementOf(book: readonly PriceVersion[], capability: string, model: string, q: Quote, outcome: Outcome): Settlement {
  const price = (u: Usage) => priceUsage(book, capability, model, u, q.pricedAt);
  const none = { userCredits: 0, releaseCredits: q.maxCredits, costUsd: 0, lossUsd: 0, lossReason: null };
  if (outcome.kind === 'provider_error' && !outcome.billed) return none;
  if (outcome.kind === 'provider_error') {
    const p = price(outcome.billedUsage);
    // Unpriceable billed usage: still our loss; the amount is unknown, so record the quote's worst case (errs high).
    const usd = p.ok ? p.usd : q.usdWorst;
    return { ...none, costUsd: usd, lossUsd: usd, lossReason: `google_billed_failure: ${outcome.reason}`.slice(0, 200) };
  }
  const usage = outcome.kind === 'success' ? outcome.usage : outcome.completedUsage;
  const p = price(usage);
  if (!p.ok) {
    // We cannot price what happened: the user pays the expected price (what the card showed), capped by the hold.
    const userCredits = Math.min(q.credits, q.maxCredits);
    return { userCredits, releaseCredits: q.maxCredits - userCredits, costUsd: q.usdExpected, lossUsd: 0, lossReason: `unpriced_usage: ${p.error}`.slice(0, 200) };
  }
  const userCredits = Math.min(p.credits, q.maxCredits);
  // Above the quote: the user pays maxCredits; the cost of the excess is ours.
  const over = p.credits > q.maxCredits && p.credits > 0 ? p.usd * (1 - q.maxCredits / p.credits) : 0;
  return {
    userCredits,
    releaseCredits: q.maxCredits - userCredits,
    costUsd: p.usd,
    lossUsd: Math.round(over * 1e6) / 1e6,
    lossReason: over > 0 ? 'over_quote' : null,
  };
}

/** The canonical ledger, as lib/orchestrator/ledger exposes it (injected so tests run without a database). */
export interface LedgerPort {
  /** deductCreditsOnce: debit `amount` once per ref; a replay returns ok with replay=true. */
  debitOnce(userId: string, amount: number, ref: string): Promise<{ ok: boolean; replay?: boolean; reason?: string }>;
  /** refundCredits: credit `amount` back once per ref. */
  refundOnce(userId: string, amount: number, ref: string): Promise<{ ok: boolean; reason?: string }>;
  /** Net debited for a ref (null = unknown). Used to find the hold. */
  netDebited(userId: string, ref: string): Promise<number | null>;
}

export interface CostPort {
  /** Insert one provider_costs row per ref; a second insert for the same ref is a no-op. */
  record(row: { ref: string; userId: string; capability: string; model: string; versionIds: string[]; usd: number; creditsCharged: number; billedOnFailure: boolean; loss: boolean; lossReason: string | null }): Promise<boolean>;
}

const REF = /^[a-z0-9][a-z0-9:_-]{2,150}$/;

export type ReserveResult = { ok: true; held: number; replay: boolean } | { ok: false; error: 'bad_ref' | 'insufficient' | 'ledger_unavailable' };

/** Hold the worst case before the provider is called. Anything but a confirmed hold → do not call the provider. */
export async function reserve(ledger: LedgerPort, userId: string, ref: string, q: Quote): Promise<ReserveResult> {
  if (!REF.test(ref) || !(q.maxCredits > 0)) return { ok: false, error: 'bad_ref' };
  try {
    const r = await ledger.debitOnce(userId, q.maxCredits, `${ref}:hold`);
    if (r.ok) return { ok: true, held: q.maxCredits, replay: r.replay === true };
    return { ok: false, error: r.reason === 'insufficient' ? 'insufficient' : 'ledger_unavailable' };
  } catch {
    return { ok: false, error: 'ledger_unavailable' };
  }
}

export type SettleResult =
  | { ok: true; settlement: Settlement; costRecorded: boolean }
  | { ok: false; error: 'no_hold' | 'hold_mismatch' | 'release_failed'; settlement?: Settlement };

/** Settle once. Safe to retry: the release and the cost row are both ref-idempotent. */
export async function settle(
  deps: { ledger: LedgerPort; costs: CostPort },
  input: { userId: string; ref: string; capability: string; model: string; quote: Quote; outcome: Outcome; book: readonly PriceVersion[] },
): Promise<SettleResult> {
  const held = await deps.ledger.netDebited(input.userId, `${input.ref}:hold`).catch(() => null);
  if (held === null || held <= 0) return { ok: false, error: 'no_hold' };
  if (held !== input.quote.maxCredits) return { ok: false, error: 'hold_mismatch' };
  const s = settlementOf(input.book, input.capability, input.model, input.quote, input.outcome);
  if (s.releaseCredits > 0) {
    const r = await deps.ledger.refundOnce(input.userId, s.releaseCredits, `${input.ref}:release`).catch(() => ({ ok: false }));
    if (!r.ok) return { ok: false, error: 'release_failed', settlement: s };
  }
  const costRecorded = await deps.costs.record({
    ref: input.ref,
    userId: input.userId,
    capability: input.capability,
    model: input.model,
    versionIds: input.quote.versionIds,
    usd: s.costUsd,
    creditsCharged: s.userCredits,
    billedOnFailure: input.outcome.kind === 'provider_error' && input.outcome.billed,
    loss: s.lossUsd > 0,
    lossReason: s.lossReason,
  }).catch(() => false);
  return { ok: true, settlement: s, costRecorded };
}
