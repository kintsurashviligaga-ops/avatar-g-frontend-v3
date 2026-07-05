/**
 * produceBilling — reserve-BEFORE-render Saga primitives for the /produce routes (server-only).
 *
 * The old pattern charged AFTER the render, fire-and-forget, with a non-idempotent `${kind}:${Date.now()}`
 * ref — so a 0-balance user still got the (paid) compute, a failed charge silently minted free content,
 * and a retry double-charged. This mirrors the assemble Saga instead:
 *   1. reserveProduce()  — debit up front with a STABLE ref; the route fails FAST if insufficient (no compute);
 *   2. render;
 *   3. refundProduce()   — compensate (refund) if the render did not succeed. Only refunds what was charged.
 *
 * Degrades exactly like the ledger: when the deduct_credits RPC isn't provisioned it reports `skipped`
 * → proceed WITHOUT charging (fail-open, zero regression), and there's nothing to refund.
 */
import 'server-only';
import { deductCredits, refundCredits, type LedgerReason } from './ledger';

export interface Reservation {
  /** false → the route MUST fail-fast (do NOT render): balance too low or a DB error. */
  proceed: boolean;
  /** true → credits were actually debited → refund on render failure. false → skipped/free (nothing to refund). */
  charged: boolean;
  reason: 'ok' | LedgerReason;
  balance?: number;
}

/** Stable, per-operation idempotency ref. Prefer a client-supplied key; else the server pipelineId. */
export function produceRef(kind: string, key: string): string {
  return `${kind}:${key}`;
}

/**
 * Derive the reservation ref from a client-supplied `idempotencyKey` (stable across HTTP retries of the
 * SAME logical job) when present, falling back to the per-request pipelineId. The client should send one
 * stable key per user-initiated generation and reuse it on retry so deduct_credits collapses the repeat.
 */
export function idemRef(kind: string, pipelineId: string, body: unknown): string {
  const k = (body as { idempotencyKey?: unknown } | null | undefined)?.idempotencyKey;
  const key = typeof k === 'string' && k.trim() ? k.trim().slice(0, 80) : pipelineId;
  return produceRef(kind, key);
}

/**
 * Reserve `amount` credits BEFORE the render. Returns whether the route may proceed and whether a real
 * debit happened (so the caller knows to refund on failure).
 *   ok          → proceed, charged.
 *   insufficient → do NOT proceed (fail-fast: no compute for a user who can't pay).
 *   error        → do NOT proceed (a genuine DB failure — safer to abort than to render for free).
 *   skipped      → proceed, NOT charged (RPC absent → fail-open, exactly the prior behavior).
 */
export async function reserveProduce(userId: string, amount: number, ref: string): Promise<Reservation> {
  const r = await deductCredits(userId, amount, ref);
  if (r.ok) return { proceed: true, charged: true, reason: 'ok', balance: r.balance };
  if (r.reason === 'skipped') return { proceed: true, charged: false, reason: 'skipped' };
  return { proceed: false, charged: false, reason: r.reason ?? 'error', balance: r.balance };
}

/**
 * Compensate a reservation when the render did NOT succeed. No-op unless credits were actually charged.
 * Idempotent ref `${ref}:refund` (the refund_credits RPC dedupes, so a re-run can't double-refund).
 * Best-effort — never throws (a failed refund is logged by the RPC layer, not raised).
 */
export async function refundProduce(userId: string, amount: number, ref: string, charged: boolean): Promise<void> {
  if (!charged) return;
  await refundCredits(userId, amount, `${ref}:refund`).catch(() => undefined);
}
