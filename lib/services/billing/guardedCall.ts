/**
 * lib/services/billing/guardedCall.ts
 * ==================================
 * The one-line way to put a provider call behind the budget: estimate → canProceed → run → recordUsage.
 *
 * Master Task §2.1.1 says the guard runs before EVERY API call. Threading four separate steps through a
 * dozen call sites by hand is how one of them ends up unguarded, so the sequence lives here once.
 *
 * DEGRADES, NEVER BREAKS: if the guard itself throws, the call still runs. A bookkeeping fault must not
 * take the product down — that is what the loud `console.error` and the `ledger_unavailable` alert are for.
 * The only thing that stops a call is an explicit "no" from the budget.
 */

import 'server-only';
import { canProceed, recordUsage } from './BillingGuard';
import { estimateCost, type EstimateInput, type ServiceType } from './costModel';

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

  let allowed = true;
  let reason = 'ok';
  try {
    const decision = await canProceed(estimate, opts.isFreeTier === undefined ? {} : { isFreeTier: opts.isFreeTier });
    allowed = decision.allowed;
    reason = decision.reason;
  } catch (err) {
    // The guard broke, not the budget. Fail OPEN and shout — see the fail-direction note in BillingGuard.
    // eslint-disable-next-line no-console
    console.error('[guardedCall] budget check threw → allowing the call:', err instanceof Error ? err.message : err);
  }
  if (!allowed) throw new BudgetExceededError(opts.service, reason);

  const result = await fn();

  // Booking happens after a SUCCESSFUL call: a provider error costs us nothing, and charging the budget for
  // it would slowly starve the envelope on a broken provider.
  try {
    let usd: number | undefined;
    try {
      usd = opts.actualCost?.(result);
    } catch {
      usd = undefined;
    }
    await recordUsage(
      typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? { ...estimate, estimatedCost: usd } : estimate,
      { userId: opts.userId ?? null, ...(opts.promptSummary ? { promptSummary: opts.promptSummary } : {}) },
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[guardedCall] recordUsage failed (call already succeeded):', err instanceof Error ? err.message : err);
  }

  return result;
}
