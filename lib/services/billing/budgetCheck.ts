/**
 * lib/services/billing/budgetCheck.ts
 * ===================================
 * "Would the platform budget refuse this call?" — asked BEFORE a route reserves the user's credits, so a refusal
 * charges nothing, refunds nothing, and tells the person which limit stopped it (budgetMessage.ts).
 *
 * The provider call itself still passes its own guard (guardedCall / generateLyriaTrack); this is the early, honest
 * answer. FAILS CLOSED like every guard read (MASTER TASK v3.1): a guard that throws refuses as `guard_unavailable`.
 */
import type { EstimateInput } from './costModel';

/**
 * The guard's refusal reason (`daily_limit`, `monthly_limit`, `service_suspended`, `full_stop`, `guard_unavailable`), or
 * null to proceed.
 */
export async function platformBudgetRefusal(input: EstimateInput): Promise<string | null> {
  try {
    const { canProceed } = await import('./BillingGuard');
    const { estimateCost } = await import('./costModel');
    const decision = await canProceed(estimateCost(input));
    return decision.allowed ? null : decision.reason;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[budgetCheck] budget check threw → refusing:', err instanceof Error ? err.message : err);
    return 'guard_unavailable';
  }
}
