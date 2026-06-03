/**
 * lib/chat/filmBalanceGate.ts
 * ===========================
 * Pure, dependency-free decision for the up-front pay-as-you-go gate on the
 * paid composite pipelines (30-second film, music video). Kept isolated from
 * filmComposite's heavy server imports (env schema → supabase) so it can be
 * unit-tested off-network and reused by any pipeline.
 */

export type BalanceGateDecision = 'ok' | 'insufficient' | 'unknown';

/**
 * Decide whether a paid render may start, given the user's wallet balance (GEL)
 * and the forecast cost:
 *  • 'unknown'      — balance is `null` (could not be read: DB error / missing
 *                     table). Fail OPEN (proceed) so an infra blip never locks
 *                     paying users out; per-leg debit + rollback still protect
 *                     spend downstream.
 *  • 'insufficient' — a CONFIRMED balance (including a no-row 0) below the
 *                     forecast. Block BEFORE spending so the user is never
 *                     stranded on a 0/5 spinner with nothing the funded stitch
 *                     step can deliver.
 *  • 'ok'           — confirmed funds meet or exceed the forecast.
 */
export function filmBalanceDecision(
  balance: number | null,
  requiredGel: number,
): BalanceGateDecision {
  if (balance === null) return 'unknown';
  return balance < requiredGel ? 'insufficient' : 'ok';
}
