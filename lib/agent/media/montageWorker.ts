/**
 * lib/agent/media/montageWorker.ts — the worker side of Agent G's montage: render a queued job under a lease, and the
 * sweep that keeps the queue honest.
 *
 *   work    claim the row (lib/orchestrator/jobLease) → renew the lease every HEARTBEAT_MS while the EXISTING montage
 *           lane renders → QC the master → complete the row (= the Library). The heartbeat is also how the worker
 *           hears that the owner cancelled (or that the sweep gave the job up): it aborts the render, which kills the
 *           running ffmpeg (lib/video/ffmpegExec withFfmpegSignal), and nothing is delivered. A render that fails on
 *           its own (bad media, QC) is final at once, owing back whatever was charged. A worker that DIES (its function
 *           killed, a deploy, a crash) simply stops renewing; its lease lapses and the next worker retries the job once.
 *   sweep   fail the rows whose last attempt died (or whose billing hold was abandoned), pay every debt a final row
 *           still owes, and hand one waiting job to a worker. Run by the per-minute cron (app/api/agent/media/sweep).
 *
 * Every write is fenced: stage, completion and failure land only while this worker still holds the lease, so a worker
 * that lost it (or a cancelled job) can no longer move the row, and a second worker never delivers over the first.
 */
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { validateMontageRequest, timelineDuration } from '@/lib/services/montage/montagePlan';
import { HEARTBEAT_MS, claim, complete, fail, heartbeat, reap, type Beat, type LeaseRow } from '@/lib/orchestrator/jobLease';
import { MONTAGE_KIND, payDebt, reserveOf, type MontageExecDeps } from './montageExec';
import { qcMaster } from './montageAsk';

export type WorkResult =
  | { ran: false; reason: string }
  | { ran: true; outcome: 'delivered'; videoUrl: string }
  | { ran: true; outcome: 'failed'; error: string }
  | { ran: true; outcome: 'stopped' | 'lost' };

/** Render one queued montage, if this worker can claim it. Never throws. */
export async function workMontageJob(deps: MontageExecDeps, input: { jobId: string; worker: string }): Promise<WorkResult> {
  const { jobId, worker } = input;
  const c = await claim(deps.store, jobId, worker, deps.now());
  if (!c.ok) return { ran: false, reason: c.reason };
  const row = c.row;
  const userId = row.userId;
  const attempt = row.exec?.attempt ?? 1;
  const owe = reserveOf(row) !== null;
  const credits = reserveOf(row)?.credits ?? 0;

  const end = async (error: string, detail: string): Promise<WorkResult> => {
    if (await fail(deps.store, jobId, worker, error, owe)) {
      await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'failed', jobId, credits, attempt, detail });
      const failed = await deps.store.read(jobId);
      if (failed) await payDebt(deps, failed);
      return { ran: true, outcome: 'failed', error };
    }
    return halted(await afterLoss());
  };
  // Why a fenced write did not land: the row was failed under this worker (cancel, sweep), or another worker has it.
  const afterLoss = async (): Promise<Beat> => ((await deps.store.read(jobId))?.status === 'failed' ? 'stopped' : 'lost');
  const halted = async (beat: Beat): Promise<WorkResult> => {
    if (beat === 'stopped') {
      // The owner cancelled, or the sweep gave the job up: the row is final and may owe a refund. Pay it if nobody did.
      const final = await deps.store.read(jobId);
      if (final) await payDebt(deps, final);
      await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'cancelled', jobId, attempt, detail: final?.error ?? 'stopped' });
      return { ran: true, outcome: 'stopped' };
    }
    // Another worker holds the row now, or delivered it (this one stalled past its lease). It owns the job.
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'lost', jobId, attempt, detail: 'lease taken over' });
    return { ran: true, outcome: 'lost' };
  };

  const job = row.params._job as { request?: unknown } | undefined;
  const valid = validateMontageRequest(job?.request);
  if (!valid.ok || !valid.request) return end(`invalid_request: ${valid.error ?? 'the stored plan is not valid'}`.slice(0, 300), 'invalid stored plan');
  const request = valid.request;
  const totalSec = timelineDuration(request.shots);
  await deps.audit({ userId, op: 'montage', phase: 'run', outcome: attempt > 1 ? 'retried' : 'ok', jobId, credits, attempt, detail: 'started' });

  // ── the heartbeat: renews the lease, and is how this worker hears it must stop ───────────────────────────────────
  const ctl = new AbortController();
  let beat: Beat = 'held';
  const stopBeating = deps.every(HEARTBEAT_MS, async () => {
    if (ctl.signal.aborted) return;
    const b = await heartbeat(deps.store, jobId, worker, deps.now());
    if (b !== 'held') {
      beat = b;
      ctl.abort();
    }
  });
  try {
    let outcome: MontageOutcome;
    try {
      outcome = await deps.render(request, {
        jobId,
        signal: ctl.signal,
        onStage: (step, pct) => deps.store.progress(jobId, worker, step, pct),
      });
    } catch (e) {
      outcome = { ok: false, step: 'resolve', error: e instanceof Error ? e.message : 'render failed' };
    }
    if (ctl.signal.aborted) return halted(beat);
    if (!outcome.ok) return end(`render_failed: ${outcome.step}: ${outcome.error}`.slice(0, 300), `${outcome.step}: ${outcome.error}`.slice(0, 200));

    // ── QC before delivery ───────────────────────────────────────────────────────────────────────────────────────
    const problems: string[] = [];
    if (!outcome.result.hasMusic) problems.push('the music did not mix');
    const qc = qcMaster(await deps.probe(outcome.result.videoUrl), totalSec);
    problems.push(...qc.problems);
    if (ctl.signal.aborted) return halted(beat);
    if (problems.length) return end(`qc_failed: ${problems.join('; ')}`.slice(0, 300), `qc: ${problems.join('; ')}`.slice(0, 200));

    const videoUrl = outcome.result.videoUrl;
    const delivered = await complete(deps.store, jobId, worker, {
      signedUrl: videoUrl,
      result: { videoUrl, subtype: 'montage', via: 'agent-g', durationSec: qc.durationSec, aspect: request.aspect },
    });
    if (!delivered) return halted(await afterLoss());
    await deps.audit({ userId, op: 'montage', phase: 'run', outcome: 'ok', jobId, credits, attempt, durationSec: qc.durationSec, detail: 'delivered' });
    return { ran: true, outcome: 'delivered', videoUrl };
  } finally {
    stopBeating();
  }
}

export interface SweepReport {
  /** Rows failed because their last attempt died or their charge never finished. */
  gaveUp: string[];
  /** Debts paid (refunds that had not landed yet). */
  paid: string[];
  /** Jobs waiting for a worker. */
  waiting: string[];
  /** What the one job this sweep worked on came to. */
  worked?: { jobId: string; result: WorkResult };
}

export const GAVE_UP = 'render_failed: the render stopped twice and was not retried again';
export const HOLD_ABANDONED = 'billing_unavailable: the charge for this edit never finished';

/**
 * Keep the queue honest, then (when `work`) render the oldest waiting job here. Never throws; a sweep that cannot
 * read the queue simply finds nothing to do.
 */
export async function sweepMontageJobs(deps: MontageExecDeps, opts: { worker: string; work: boolean }): Promise<SweepReport> {
  const now = deps.now();
  const r = await reap(deps.store, MONTAGE_KIND, now, {
    owesRefund: (row: LeaseRow) => reserveOf(row) !== null,
    error: GAVE_UP,
    abandonedError: HOLD_ABANDONED,
  });
  const report: SweepReport = { gaveUp: [], paid: [], waiting: r.runnable };
  for (const row of r.exhausted) {
    report.gaveUp.push(row.id);
    await deps.audit({ userId: row.userId, op: 'montage', phase: 'run', outcome: 'failed', jobId: row.id, attempt: row.exec?.attempt, detail: row.error ?? 'gave up' });
  }
  for (const row of await deps.store.listOwed(MONTAGE_KIND, 25)) {
    await payDebt(deps, row);
    const after = await deps.store.read(row.id);
    if (after && !after.exec?.owe) report.paid.push(row.id);
  }
  if (opts.work) {
    for (const jobId of r.runnable) {
      const result = await workMontageJob(deps, { jobId, worker: opts.worker });
      if (result.ran) {
        report.worked = { jobId, result };
        break;
      }
    }
  }
  return report;
}
