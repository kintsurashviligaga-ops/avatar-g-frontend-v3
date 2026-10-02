/**
 * lib/orchestrator/unpolledSettle.ts — settle PAID async jobs that nobody polled to the end.
 *
 * ⚠️ THE GAP THIS CLOSES. Avatar (lip-sync, presenter), Motion Control and 3D all RESERVE credits at submit and then
 * leave the job to the BROWSER: the refund on a provider failure, and the delivery on a success, happen only inside
 * the poll route the client keeps calling. Close the tab (or lose signal on a phone) mid-render and nothing ever
 * polls again: a failed render keeps the user's credits forever, and a successful one is never re-hosted or filed in
 * the Library — paid for and lost either way. The render drainer could not help: it refunds `_reserve` blindly on
 * age, which for these jobs would refund renders that SUCCEEDED, so they deliberately never carried one.
 *
 * So each such job now files a durable row at submit with `params._settle` (what to poll, under which ref it was
 * charged), and the cron asks the PROVIDER for the verdict — never the clock alone:
 *   · succeeded → deliver (re-host + file completed). The charge stands.
 *   · failed    → refund what the LEDGER shows under the ref (refundDebitByRef, `${ref}:refund` — the same idempotent
 *                 ref the poll routes use, so a client poll and this sweep collapse to ONE credit-back), then fail.
 *   · processing past SETTLE_HARD_CAP_MS, or a success we still cannot deliver by then → refund + fail.
 * The refund lands BEFORE the row turns terminal: if it fails, the row stays live and the next tick retries.
 *
 * Pure: every effect is injected, so the decisions are unit-tested without a database, a provider or a clock.
 */

export type SettleKind = 'lipsync' | 'presenter' | 'model3d' | 'motion';

/** What a paid async job files at submit, under `params._settle`. */
export interface SettleRecord {
  v: 1;
  kind: SettleKind;
  /** The provider job to poll (lipsync/presenter: the lipsyncFetch id, model3d: the Replicate prediction, motion:
   *  the Kling prediction). */
  job: string;
  /** The deduct_credits ref the reservation was taken under. */
  ref: string;
  /** What was reserved — a CAP for the refund, which pays back only what the ledger shows under `ref`. */
  credits: number;
}

const KINDS: ReadonlySet<string> = new Set<SettleKind>(['lipsync', 'presenter', 'model3d', 'motion']);

/** `{ _settle: … }` for a job row's params — merge it into whatever the route already stores. */
export function settleParams(rec: Omit<SettleRecord, 'v'>): { _settle: SettleRecord } {
  return { _settle: { v: 1, kind: rec.kind, job: rec.job, ref: rec.ref, credits: Math.round(rec.credits) } };
}

/** The settle record of a row's params, or null when absent or malformed (never guess a ref or an amount). */
export function readSettle(params: unknown): SettleRecord | null {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return null;
  const s = (params as Record<string, unknown>)._settle;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const r = s as Record<string, unknown>;
  if (r.v !== 1 || typeof r.kind !== 'string' || !KINDS.has(r.kind)) return null;
  const job = typeof r.job === 'string' ? r.job.trim() : '';
  const ref = typeof r.ref === 'string' ? r.ref.trim() : '';
  const credits = typeof r.credits === 'number' && Number.isFinite(r.credits) ? Math.round(r.credits) : 0;
  if (!job || !ref || credits <= 0) return null;
  return { v: 1, kind: r.kind as SettleKind, job, ref, credits };
}

/** Rows younger than this are left to the client — past every studio's own polling window (≤ ~29 min for 3D). */
export const SETTLE_STALE_MS = 30 * 60_000;
/** A job still not terminal this long after submit is treated as dead: refunded and failed. */
export const SETTLE_HARD_CAP_MS = 3 * 60 * 60_000;

/** The provider's answer, reduced to what settlement needs. Anything transient or unknown is `processing`. */
export type SettleVerdict = { state: 'succeeded'; url: string } | { state: 'failed'; reason: string } | { state: 'processing' };

export type SettleAction = 'deliver' | 'refund' | 'wait';

/** What to do with a job, given the provider's verdict and how long ago it was submitted. */
export function settleAction(verdict: SettleVerdict, ageMs: number, hardCapMs: number = SETTLE_HARD_CAP_MS): SettleAction {
  if (verdict.state === 'succeeded') return 'deliver';
  if (verdict.state === 'failed') return 'refund';
  return Number.isFinite(ageMs) && ageMs >= hardCapMs ? 'refund' : 'wait';
}

export interface SettleRow {
  id: string;
  user_id: string | null;
  status: string;
  created_at: string;
  params: unknown;
}

export interface SettleDeps {
  /** Non-terminal rows carrying `_settle`, created before `beforeIso`, oldest first. */
  listStale(beforeIso: string, limit: number): Promise<SettleRow[]>;
  poll(rec: SettleRecord): Promise<SettleVerdict>;
  /** Re-host + file the row completed. false → could not deliver this tick (retried, until the hard cap). */
  deliver(row: SettleRow, rec: SettleRecord, url: string): Promise<boolean>;
  /** Refund what the ledger shows under rec.ref. 'refunded' | 'nothing' (already refunded / never charged) | 'error'. */
  refund(userId: string, rec: SettleRecord): Promise<'refunded' | 'nothing' | 'error'>;
  fail(id: string, reason: string): Promise<void>;
  now(): number;
}

export interface SettleReport {
  examined: number;
  delivered: number;
  refunded: number;
  waiting: number;
  errors: number;
}

/**
 * One sweep. Bounded by `limit` rows and `budgetMs` of wall clock (a cron tick has a ceiling of its own), so a slow
 * provider can never push the tick past its function limit — unvisited rows simply wait for the next tick.
 */
export async function settleUnpolled(
  deps: SettleDeps,
  opts: { limit?: number; budgetMs?: number; staleMs?: number; hardCapMs?: number } = {},
): Promise<SettleReport> {
  const report: SettleReport = { examined: 0, delivered: 0, refunded: 0, waiting: 0, errors: 0 };
  const startedAt = deps.now();
  const limit = opts.limit ?? 10;
  const budgetMs = opts.budgetMs ?? 40_000;
  const hardCapMs = opts.hardCapMs ?? SETTLE_HARD_CAP_MS;
  const before = new Date(startedAt - (opts.staleMs ?? SETTLE_STALE_MS)).toISOString();

  let rows: SettleRow[] = [];
  try {
    rows = await deps.listStale(before, limit);
  } catch {
    report.errors += 1;
    return report;
  }

  for (const row of rows) {
    if (deps.now() - startedAt > budgetMs) break;
    const rec = readSettle(row.params);
    const userId = typeof row.user_id === 'string' ? row.user_id : '';
    if (!rec || !userId) continue; // nothing safe to act on — never guess an owner or a ref
    report.examined += 1;

    const verdict = await deps.poll(rec).catch((): SettleVerdict => ({ state: 'processing' }));
    const ageMs = deps.now() - Date.parse(row.created_at);
    let action = settleAction(verdict, ageMs, hardCapMs);

    if (action === 'deliver' && verdict.state === 'succeeded') {
      const ok = await deps.deliver(row, rec, verdict.url).catch(() => false);
      if (ok) { report.delivered += 1; continue; }
      // A success we cannot deliver is retried — until the hard cap, after which the user never got it: refund.
      if (!(Number.isFinite(ageMs) && ageMs >= hardCapMs)) { report.waiting += 1; continue; }
      action = 'refund';
    }

    if (action === 'wait') { report.waiting += 1; continue; }

    // REFUND FIRST, while the row is still live: if the ledger write fails, the next tick finds it again.
    const r = await deps.refund(userId, rec).catch(() => 'error' as const);
    if (r === 'error') { report.errors += 1; continue; }
    if (r === 'refunded') report.refunded += 1;
    const reason = verdict.state === 'failed'
      ? `settled after the client stopped polling: ${verdict.reason}`.slice(0, 300)
      : 'settled after the client stopped polling: no result in time';
    await deps.fail(row.id, reason).catch(() => undefined);
  }
  return report;
}
