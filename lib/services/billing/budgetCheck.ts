/**
 * lib/services/billing/budgetCheck.ts
 * ===================================
 * "Would the platform budget refuse this call?" — asked BEFORE a route reserves the user's credits, so a refusal
 * charges nothing, refunds nothing, and tells the person which limit stopped it (budgetMessage.ts).
 *
 * The provider call itself still passes its own guard (guardedCall / generateLyriaTrack); this is the early, honest
 * answer. FAILS OPEN like every guard read: a broken ledger must not take a service down (BillingGuard's note).
 */
import type { EstimateInput } from './costModel';

/** The guard's refusal reason (`daily_limit`, `monthly_limit`, `service_suspended`, `full_stop`), or null to proceed. */
export async function platformBudgetRefusal(input: EstimateInput): Promise<string | null> {
  try {
    const { canProceed } = await import('./BillingGuard');
    const { estimateCost } = await import('./costModel');
    const decision = await canProceed(estimateCost(input));
    return decision.allowed ? null : decision.reason;
  } catch {
    return null;
  }
}
