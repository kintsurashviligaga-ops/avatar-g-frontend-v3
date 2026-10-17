/**
 * lib/chat/filmFollowWorker.ts — the server's side of a chat film whose tab closed (./filmFollow has the record and the
 * rules). Run by the per-minute sweep (app/api/film/sweep); every effect is injected (./filmFollowLive wires the real
 * ones), so every rule is tested against an in-memory queue.
 *
 * One sweep:
 *   1. reap   a follow row whose last attempt died with no attempts left is failed, owing whatever the film still has
 *             charged (lib/orchestrator/jobLease reap);
 *   2. pay    every debt a closed row owes: the film's charge back (the ledger pays the net of what was taken, once), but
 *             only once nothing can deliver the film any more: no master on its status record, no stitch running, not in
 *             the owner's Library. A check that cannot answer keeps the debt for the next minute;
 *   3. follow every live row, oldest first:
 *             · the film has its master (the tab stitched it) → the row is closed as delivered;
 *             · its tab polled it in the last FOLLOW_TAKEOVER_MS, or a stitch began less than FOLLOW_STITCH_WINDOW_MS
 *               ago → left alone: one driver per film;
 *             · otherwise the sweep polls the film as its owner, which sends the next scene exactly as the tab's poll
 *               would, and decides like the tab (decideFollow): wait, stitch, or fail and pay back;
 *             · at most ONE stitch per sweep, and only with enough of the sweep's time left for it; it runs through the
 *               same route and body as the tab's, under the row's lease, renewed every HEARTBEAT_MS.
 *
 * A follow row never reaches the Library: it completes with no signed URL and no url in its result. The film's own
 * Library row (id = its token) is written by /api/video/assemble, whoever stitched, with its notification.
 */
import {
  HEARTBEAT_MS, claim, claimable, complete, fail, failPending, heartbeat, mustStop, reap, settled,
  type Beat, type LeaseRow, type LeaseStore,
} from '@/lib/orchestrator/jobLease';
import type { FilmStatusRecord } from './filmStatusStore';
import { filmAssembleBody, type FilmStudioMatrix } from './filmStudioClient';
import {
  FILM_FOLLOW_KIND, FOLLOW_MAX_MS, FOLLOW_STITCH_WINDOW_MS, FOLLOW_TAKEOVER_MS, decideFollow, verifyFollow,
  type FilmFollowRecord, type FollowCheck,
} from './filmFollow';

/** A stitch is started only with this much of the sweep's time left (a 30 s film's stitch takes about 200 s cold). */
export const STITCH_MIN_BUDGET_MS = 360_000;
/** Kept back from the stitch's budget for the writes after it. */
export const STITCH_RESERVE_MS = 30_000;
/** Live rows looked at per sweep (each is a poll). */
export const FOLLOW_SCAN_LIMIT = 10;

const GAVE_UP = 'film_follow_gave_up: the server could not finish this film';

export interface StitchOutcome {
  /** The route's HTTP status; 0 when the call itself failed (aborted, threw). */
  status: number;
  url: string | null;
  /** The route's error code, when it gave one. */
  error: string | null;
}

export interface FilmFollowDeps {
  store: LeaseStore;
  key(): string;
  now(): number;
  /** When the film's tab last polled it; null = not lately; 'unknown' = the shared store did not answer. */
  watchedAt(tokenId: string): Promise<number | null | 'unknown'>;
  /** The film's status record; null = none; 'unknown' = the shared store did not answer. */
  status(tokenId: string): Promise<FilmStatusRecord | null | 'unknown'>;
  /** Is the film in the owner's Library? null = could not tell. */
  delivered(userId: string, tokenId: string): Promise<boolean | null>;
  /** Poll the film as its owner (the call the tab's poll makes): its matrix; null = no film came back; 'error' = the poll failed. */
  poll(rec: FilmFollowRecord): Promise<FilmStudioMatrix | null | 'error'>;
  /** Stitch through /api/video/assemble as the film's owner. */
  stitch(rec: FilmFollowRecord, body: Record<string, unknown>, opts: { budgetMs: number; signal: AbortSignal }): Promise<StitchOutcome>;
  /** Give back what the film still has charged: 'paid', 'nothing' (nothing was left), 'error' (try again later). */
  refund(userId: string, tokenId: string): Promise<'paid' | 'nothing' | 'error'>;
  /** Mark the film failed on its status record, so a tab that comes back shows it. */
  markFailed(tokenId: string, error: string): Promise<void>;
  /** Tell the owner the film could not be finished (and whether its charge came back). */
  notifyFailed(rec: FilmFollowRecord, refunded: boolean): Promise<void>;
  /** `tick` every `ms`, never two at once, until the returned stop is called. */
  every(ms: number, tick: () => Promise<void>): () => void;
  log(event: string, data: Record<string, unknown>): void;
}

export interface FollowSweepReport {
  gaveUp: string[];
  paid: string[];
  stillOwed: string[];
  delivered: string[];
  stitched: string[];
  failed: string[];
  waiting: string[];
  invalid: string[];
  /** The stitch this sweep ran, if any. */
  stitch?: { id: string; outcome: 'delivered' | 'retry' | 'failed' | 'busy' | 'lost' };
}

const check = (deps: FilmFollowDeps, row: LeaseRow, now: number): FollowCheck =>
  verifyFollow(row.params._follow, deps.key(), { userId: row.userId, jobId: row.id, now });
/** The film a check names: valid, or authentic but expired. null = not a record this server signed. */
const recOf = (c: FollowCheck): FilmFollowRecord | null => ('rec' in c ? c.rec : null);

/** Pay what a closed row owes, once nothing can deliver its film any more. 'kept' = asked again next sweep. */
export async function payDebt(deps: FilmFollowDeps, row: LeaseRow): Promise<'paid' | 'settled' | 'kept'> {
  if (!row.exec?.owe) return 'settled';
  const now = deps.now();
  const rec = recOf(check(deps, row, now));
  if (!rec) {
    // Not a record this server signed: nothing is owed on it.
    await settled(deps.store, row.id);
    deps.log('film_follow_debt_invalid', { id: row.id });
    return 'settled';
  }
  const status = await deps.status(rec.t);
  if (status === 'unknown') return 'kept';
  if (status?.masterUrl) {
    await settled(deps.store, row.id);
    return 'settled';
  }
  // A stitch someone started may still deliver: wait it out before paying the film back.
  if (status?.phase === 'assembling' && now - status.updatedAt < FOLLOW_STITCH_WINDOW_MS) return 'kept';
  const inLibrary = await deps.delivered(rec.u, rec.t);
  if (inLibrary === null) return 'kept';
  if (inLibrary) {
    await settled(deps.store, row.id);
    return 'settled';
  }
  const paid = await deps.refund(rec.u, rec.t);
  if (paid === 'error') {
    deps.log('film_follow_refund_failed', { id: row.id });
    return 'kept';
  }
  await settled(deps.store, row.id);
  await deps.markFailed(rec.t, row.error ?? 'The film could not be finished.').catch(() => {});
  await deps.notifyFailed(rec, paid === 'paid').catch(() => {});
  deps.log('film_follow_refunded', { id: row.id, paid });
  return 'paid';
}

/** Claim the row and close it as failed, owing the film's charge; then try to pay it at once. */
async function closeFailed(deps: FilmFollowDeps, row: LeaseRow, worker: string, reason: string): Promise<boolean> {
  const c = await claim(deps.store, row.id, worker, deps.now());
  if (!c.ok) return false;
  const ok = await fail(deps.store, row.id, worker, `film_${reason}`, true, { outcome: reason });
  if (!ok) return false;
  const after = await deps.store.read(row.id);
  if (after) await payDebt(deps, after);
  return true;
}

/** Claim the row and close it as delivered (the film has its master). */
async function closeDelivered(deps: FilmFollowDeps, row: LeaseRow, worker: string, by: 'tab' | 'server'): Promise<boolean> {
  const c = await claim(deps.store, row.id, worker, deps.now());
  if (!c.ok) return false;
  return complete(deps.store, row.id, worker, { signedUrl: null, result: { outcome: 'delivered', by } });
}

/** Errors a stitch may succeed on when tried again; every other refusal is final for the film. */
const RETRYABLE = (o: StitchOutcome): boolean => o.status === 0 || o.status === 503 || (o.status >= 500 && o.error !== 'qc_rejected') || (o.status === 200 && !o.url);

async function stitchFilm(
  deps: FilmFollowDeps, row: LeaseRow, rec: FilmFollowRecord, matrix: FilmStudioMatrix, worker: string, budgetMs: number,
): Promise<NonNullable<FollowSweepReport['stitch']>['outcome'] | null> {
  const c = await claim(deps.store, row.id, worker, deps.now());
  if (!c.ok) return null;
  const ctl = new AbortController();
  let beat: Beat = 'held';
  const stop = deps.every(HEARTBEAT_MS, async () => {
    if (ctl.signal.aborted) return;
    const b = await heartbeat(deps.store, row.id, worker, deps.now());
    if (mustStop(b)) {
      beat = b;
      ctl.abort();
    }
  });
  let out: StitchOutcome;
  try {
    out = await deps.stitch(rec, filmAssembleBody(rec.plan, matrix, rec.m), { budgetMs, signal: ctl.signal });
  } catch {
    out = { status: 0, url: null, error: null };
  } finally {
    stop();
  }
  if (ctl.signal.aborted || mustStop(beat)) return 'lost';
  if (out.status === 200 && out.url) {
    await complete(deps.store, row.id, worker, { signedUrl: null, result: { outcome: 'delivered', by: 'server' } });
    return 'delivered';
  }
  // Someone else is stitching this film right now: the lease lapses and the next sweep looks again.
  if (out.status === 409) return 'busy';
  // At most two stitches per film: the last attempt is kept for closing the row (delivered, or failed and paid back).
  const canRetry = (c.row.exec?.attempt ?? 0) < (c.row.exec?.maxAttempts ?? 0) - 1;
  if (RETRYABLE(out) && canRetry) {
    deps.log('film_follow_stitch_retry', { id: row.id, status: out.status, error: out.error });
    return 'retry';
  }
  await fail(deps.store, row.id, worker, `film_stitch_failed: ${out.error ?? `HTTP ${out.status}`}`, true, { outcome: 'stitch_failed', status: out.status });
  const after = await deps.store.read(row.id);
  if (after) await payDebt(deps, after);
  return 'failed';
}

export async function sweepFilmFollows(
  deps: FilmFollowDeps,
  opts: { worker: string; startedAt: number; budgetMs: number; limit?: number },
): Promise<FollowSweepReport> {
  const report: FollowSweepReport = { gaveUp: [], paid: [], stillOwed: [], delivered: [], stitched: [], failed: [], waiting: [], invalid: [] };
  const now = deps.now();
  const r = await reap(deps.store, FILM_FOLLOW_KIND, now, {
    limit: 50,
    // Owed unless the record is not ours; payDebt decides whether anything is actually paid.
    owesRefund: (row) => {
      const c = check(deps, row, now);
      return c.ok || c.reason === 'expired';
    },
    error: GAVE_UP,
    abandonedError: GAVE_UP,
  });
  for (const row of r.exhausted) report.gaveUp.push(row.id);

  for (const row of await deps.store.listOwed(FILM_FOLLOW_KIND, 25)) {
    const out = await payDebt(deps, row);
    (out === 'kept' ? report.stillOwed : report.paid).push(row.id);
  }

  let stitchedOne = false;
  const live = await deps.store.listLive(FILM_FOLLOW_KIND, opts.limit ?? FOLLOW_SCAN_LIMIT);
  for (const row of live) {
    const t = deps.now();
    if (!claimable(row, t)) continue; // held by another sweep's stitch, or reaped above
    const c = check(deps, row, t);
    const rec = recOf(c);
    if (!rec) {
      if (row.status === 'pending') await failPending(deps.store, row.id, 'film_follow_invalid');
      else if ((await claim(deps.store, row.id, opts.worker, t)).ok) await fail(deps.store, row.id, opts.worker, 'film_follow_invalid', false);
      report.invalid.push(row.id);
      continue;
    }
    const status = await deps.status(rec.t);
    if (status === 'unknown') { report.waiting.push(row.id); continue; }
    if (status?.masterUrl) {
      if (await closeDelivered(deps, row, opts.worker, 'tab')) report.delivered.push(row.id);
      continue;
    }
    if (!c.ok) {
      // Past the record's life with no master: nothing more is done for this film. Closed owing its charge.
      if (await closeFailed(deps, row, opts.worker, 'timed_out')) report.failed.push(row.id);
      continue;
    }
    const watched = await deps.watchedAt(rec.t);
    if (watched === 'unknown') { report.waiting.push(row.id); continue; }
    if (t - Math.max(rec.c, watched ?? 0) < FOLLOW_TAKEOVER_MS) { report.waiting.push(row.id); continue; }
    if (status?.phase === 'assembling' && t - status.updatedAt < FOLLOW_STITCH_WINDOW_MS) { report.waiting.push(row.id); continue; }

    const matrix = await deps.poll(rec);
    const age = t - rec.c;
    if (matrix === 'error') {
      // A poll that failed says nothing about the film. Only well past every window is it given up on.
      if (age > FOLLOW_MAX_MS + FOLLOW_STITCH_WINDOW_MS && await closeFailed(deps, row, opts.worker, 'timed_out')) report.failed.push(row.id);
      else report.waiting.push(row.id);
      continue;
    }
    const decision = decideFollow(matrix, age);
    if (decision.kind === 'wait') { report.waiting.push(row.id); continue; }
    if (decision.kind === 'fail') {
      if (await closeFailed(deps, row, opts.worker, decision.reason)) report.failed.push(row.id);
      continue;
    }
    const left = opts.budgetMs - (deps.now() - opts.startedAt);
    if (stitchedOne || !matrix || left < STITCH_MIN_BUDGET_MS) { report.waiting.push(row.id); continue; }
    stitchedOne = true;
    const outcome = await stitchFilm(deps, row, rec, matrix, opts.worker, left - STITCH_RESERVE_MS);
    if (!outcome) { report.waiting.push(row.id); continue; }
    report.stitch = { id: row.id, outcome };
    if (outcome === 'delivered') report.stitched.push(row.id);
    else if (outcome === 'failed') report.failed.push(row.id);
    else report.waiting.push(row.id);
  }
  return report;
}
