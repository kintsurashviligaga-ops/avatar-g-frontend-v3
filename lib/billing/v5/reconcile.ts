/**
 * lib/billing/v5/reconcile.ts — daily: what Google billed vs what our ledger recorded (v5.1 Phase 5, M-9; PREPARED, NOT
 * WIRED). Pure. Read-only by design: a report and alarms, never a balance change (08 §6).
 *
 * Inputs: the Cloud Billing export rows for one day (BigQuery; GG enables the export, an owner action) summed by the
 * `cap` label every Vertex call carries, and our provider_costs rows for the same day summed by capability.
 * Alarms: drift above DRIFT_ALARM (10 %) on a capability with real spend, and unlabeled spend above $1 a day (a call
 * that escaped the labels is a call that escaped the ledger).
 */
export const DRIFT_ALARM = 0.10;
export const UNLABELED_ALARM_USD = 1;
/** Below this a capability's drift is noise (rounding, a few cents of tokens), not an alarm. */
export const DRIFT_MIN_USD = 0.5;

export interface BilledRow { day: string; cap: string | null; usd: number }
export interface RecordedRow { day: string; capability: string; usd: number }

export interface CapLine { capability: string; billedUsd: number; recordedUsd: number; drift: number | null }
export interface ReconcileReport {
  day: string;
  lines: CapLine[];
  billedUsd: number;
  recordedUsd: number;
  unlabeledUsd: number;
  alarms: string[];
}

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function reconcileDay(day: string, billed: readonly BilledRow[], recorded: readonly RecordedRow[]): ReconcileReport {
  if (!DAY.test(day)) throw new Error('day: YYYY-MM-DD');
  const b = new Map<string, number>();
  const rec = new Map<string, number>();
  let unlabeled = 0;
  const alarms: string[] = [];
  for (const row of billed) {
    if (row.day !== day) continue;
    if (!Number.isFinite(row.usd)) { alarms.push('a billing export row has no amount'); continue; }
    if (!row.cap) unlabeled += row.usd;
    else b.set(row.cap, (b.get(row.cap) ?? 0) + row.usd);
  }
  for (const row of recorded) {
    if (row.day !== day || !Number.isFinite(row.usd)) continue;
    rec.set(row.capability, (rec.get(row.capability) ?? 0) + row.usd);
  }
  const caps = [...new Set([...b.keys(), ...rec.keys()])].sort();
  const lines: CapLine[] = caps.map((capability) => {
    const billedUsd = r6(b.get(capability) ?? 0);
    const recordedUsd = r6(rec.get(capability) ?? 0);
    const base = Math.max(billedUsd, recordedUsd);
    const drift = base > 0 ? r6(Math.abs(billedUsd - recordedUsd) / base) : null;
    if (drift !== null && drift > DRIFT_ALARM && base >= DRIFT_MIN_USD) {
      alarms.push(`${capability}: billed $${billedUsd.toFixed(2)} vs recorded $${recordedUsd.toFixed(2)} (${Math.round(drift * 100)} % drift)`);
    }
    return { capability, billedUsd, recordedUsd, drift };
  });
  if (unlabeled > UNLABELED_ALARM_USD) alarms.push(`$${unlabeled.toFixed(2)} of spend has no capability label`);
  return {
    day,
    lines,
    billedUsd: r6(lines.reduce((s, l) => s + l.billedUsd, 0) + unlabeled),
    recordedUsd: r6(lines.reduce((s, l) => s + l.recordedUsd, 0)),
    unlabeledUsd: r6(unlabeled),
    alarms,
  };
}
