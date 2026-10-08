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
 * When the ledger cannot charge at all (no service-role client, or the deduct_credits RPC isn't provisioned) it
 * reports `skipped`. ⚠️ IN PRODUCTION THAT IS NOW A REFUSAL (`billing_unavailable`), NOT A FREE RENDER: the old
 * fail-open meant a missing env var or a dropped function handed every paid render out for nothing. Only the
 * documented dev bypass — `next dev` (NODE_ENV==='development') — and the test runner keep rendering uncharged.
 */
import 'server-only';
import { deductCredits, refundCredits, type LedgerReason } from './ledger';
import { reportError } from '@/lib/observability/report-error';

export interface Reservation {
  /** false → the route MUST fail-fast (do NOT render): balance too low, a DB error, or billing unavailable. */
  proceed: boolean;
  /** true → credits were actually debited → refund on render failure. false → skipped/free (nothing to refund). */
  charged: boolean;
  reason: 'ok' | LedgerReason | 'billing_unavailable';
  balance?: number;
}

export { produceRef, bodyFingerprint, idemRef } from './idemRef';

/** May a render proceed UNCHARGED when the ledger is absent? Only outside production (`next dev`, jest). */
export function unbilledRenderAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== 'production';
}

/** The machine code a route reports for a refused reservation: only a real shortfall is "insufficient credits". */
export function reservationErrorCode(r: Pick<Reservation, 'reason'>): 'insufficient_credits' | 'billing_unavailable' {
  return r.reason === 'insufficient' ? 'insufficient_credits' : 'billing_unavailable';
}

/**
 * Reserve `amount` credits BEFORE the render. Returns whether the route may proceed and whether a real
 * debit happened (so the caller knows to refund on failure).
 *   ok           → proceed, charged.
 *   insufficient → do NOT proceed (fail-fast: no compute for a user who can't pay).
 *   error        → do NOT proceed (a genuine DB failure — safer to abort than to render for free).
 *   skipped      → production: do NOT proceed (`billing_unavailable`, alerted);
 *                  `next dev` / tests: proceed, NOT charged (the dev bypass).
 */
export async function reserveProduce(userId: string, amount: number, ref: string): Promise<Reservation> {
  const r = await deductCredits(userId, amount, ref);
  if (r.ok) return { proceed: true, charged: true, reason: 'ok', balance: r.balance };
  if (r.reason === 'skipped') {
    if (unbilledRenderAllowed()) return { proceed: true, charged: false, reason: 'skipped' };
    reportError(new Error('billing unavailable: the credit ledger could not charge a paid render — refused'), {
      fn: 'reserveProduce', userId, amount, ref,
    });
    return { proceed: false, charged: false, reason: 'billing_unavailable' };
  }
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
