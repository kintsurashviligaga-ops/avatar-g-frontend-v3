/**
 * lib/services/billing/guardedCall.ts
 * ==================================
 * The one-line way to put a provider call behind the budget: estimate → canProceed → run → recordUsage.
 *
 * Master Task §2.1.1 says the guard runs before EVERY API call. Threading four separate steps through a
 * dozen call sites by hand is how one of them ends up unguarded, so the sequence lives here once.
 *
 * FAILS CLOSED (MASTER TASK v3.1, audit F-05): if the guard itself throws, the call does NOT run. It is refused as
 * `guard_unavailable`, exactly like an unreadable ledger, because a guard that cannot answer has not said yes. This
 * used to run the call anyway. Booking after a successful call never throws into the caller (recordUsage keeps a row
 * the ledger refused; see BillingGuard UNBOOKED).
 */

import 'server-only';
import { canProceed, recordUsage } from './BillingGuard';
import { estimateCost, type EstimateInput, type ServiceType } from './costModel';
import {
  LONG_JOB_SERVICES,
  claimUserStart,
  releaseGlobalSpend,
  reserveGlobalSpend,
  settleGlobalSpend,
  type GlobalReservation,
  type UserClaim,
} from '@/lib/billing/spendCaps';
import { alertCapReached, maybeAlertSpend } from '@/lib/billing/spendAlert';

/** Thrown when the budget refuses the call. Carries the reason so the UI can say WHY. */
export class BudgetExceededError extends Error {
  readonly reason: string;
  readonly service: ServiceType;
  constructor(service: ServiceType, reason: string) {
    super(`budget_exceeded:${reason}`);
    this.name = 'BudgetExceededError';
    this.reason = reason;
    this.service = service;
  }
}

export interface GuardedCallOptions extends EstimateInput {
  userId?: string | null;
  isFreeTier?: boolean;
  promptSummary?: string;
  /**
   * Recompute the real cost from the result (e.g. the provider reported actual token usage). Returning
   * undefined books the original estimate. Never throws into the caller — a bad recompute is ignored.
   */
  actualCost?: (result: unknown) => number | undefined;
}

/**
 * Run `fn` inside the budget envelope.
 *
 * @throws BudgetExceededError when the budget refuses it — the caller decides how to surface that
 *         (a localized "ბიუჯეტი ამოიწურა" message, a queued retry, a downgrade to an economy model).
 */
export async function guardedCall<T>(opts: GuardedCallOptions, fn: () => Promise<T>): Promise<T> {
  const estimate = estimateCost(opts);

  let allowed = false;
  let reason = 'guard_unavailable';
  try {
    const decision = await canProceed(estimate, opts.isFreeTier === undefined ? {} : { isFreeTier: opts.isFreeTier });
    allowed = decision.allowed;
    reason = decision.reason;
  } catch (err) {
    // The guard broke, not the budget. Refuse and shout — see FAIL DIRECTION in BillingGuard.
    // eslint-disable-next-line no-console
    console.error('[guardedCall] budget check threw → refusing the call:', err instanceof Error ? err.message : err);
  }
  if (!allowed) throw new BudgetExceededError(opts.service, reason);

  // Phase 8.21 hard caps (lib/billing/spendCaps). Each is OFF until its env figure is set; off = nothing read or written.
  // Per account first (cheap, and a refusal there must not eat the platform's reservation), then the platform ceiling.
  let claim: UserClaim = { ok: true, release: async () => undefined };
  if (opts.userId) {
    claim = await claimUserStart(opts.userId, opts.service);
    if (!claim.ok) throw new BudgetExceededError(opts.service, claim.reason);
  }
  const reservation: GlobalReservation = await reserveGlobalSpend(estimate.estimatedCost);
  if (!reservation.ok) {
    await claim.release(true);
    void alertCapReached(
      reservation.reason,
      new Date().toISOString().slice(0, 10),
      `This call: ${opts.service} $${estimate.estimatedCost}. Reserved today: $${reservation.totalUsd ?? '?'} of $${reservation.limitUsd}.`,
    );
    throw new BudgetExceededError(opts.service, reservation.reason);
  }

  let result: T;
  try {
    result = await fn();
  } catch (err) {
    // A provider error costs nothing (see below): the reservation, the lease and the day's start go back.
    await releaseGlobalSpend(reservation);
    await claim.release(true);
    throw err;
  }
  // A quick call is over; a long job keeps its lease until LEASE_MS expires (it is still running and billing).
  if (!LONG_JOB_SERVICES.has(opts.service)) await claim.release(false);

  // Booking happens after a SUCCESSFUL call: a provider error costs us nothing, and charging the budget for
  // it would slowly starve the envelope on a broken provider.
  try {
    let usd: number | undefined;
    try {
      usd = opts.actualCost?.(result);
    } catch {
      usd = undefined;
    }
    const booked = typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? { ...estimate, estimatedCost: usd } : estimate;
    if (reservation.enforced) {
      const total = await settleGlobalSpend(reservation, booked.estimatedCost);
      if (total !== null) void maybeAlertSpend(total, new Date().toISOString().slice(0, 10));
    }
    await recordUsage(
      booked,
      { userId: opts.userId ?? null, ...(opts.promptSummary ? { promptSummary: opts.promptSummary } : {}) },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[guardedCall] recordUsage failed (call already succeeded):', err instanceof Error ? err.message : err);
  }

  return result;
}
