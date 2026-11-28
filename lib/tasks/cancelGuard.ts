/**
 * Phase 8.25 — CANCEL_RACE_GUARD: Cancel on a task only lands on a row that is still queued/processing (compare-and-set),
 * so a Cancel pressed the second the task finishes can never overwrite the finished result. Exact '1' turns it on.
 */
export function cancelRaceGuardOn(raw: string | undefined = process.env.CANCEL_RACE_GUARD): boolean {
  return raw === '1';
}
