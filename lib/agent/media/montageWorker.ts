/**
 * lib/agent/media/montageWorker.ts — the worker side of Agent G's montage: render a queued job under a lease, and the
 * sweep that keeps the queue honest.
 *
 *   work    claim the row (lib/orchestrator/jobLease) → re-check the stored manifest (every file quoted, every video
 *           with a shot, ./montageManifest) → renew the lease every HEARTBEAT_MS while the EXISTING montage lane renders
 *           → QC the master: picture + sound + codecs + length, A/V sync from the real stream lengths, and that EVERY
 *           video of the manifest really shows in it (a frame of each clip, from the output, against the same moment
 *           of the source: ./montageAsk qcClips) → complete the row (= the Library), the QC evidence in its result. A
 *           master missing any clip is failed (`clip_missing`), never delivered. The heartbeat is also how the worker
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
import { ASPECT_DIMS, timelineDuration } from '@/lib/services/montage/montagePlan';
import { HEARTBEAT_MS, claim, complete, fail, heartbeat, reap, type Beat, type LeaseRow } from '@/lib/orchestrator/jobLease';
import { MONTAGE_KIND, payDebt, reserveOf, runIdOf, type MontageExecDeps } from './montageExec';
import { CLIP_QC_MAX_DIFF, CLIP_QC_SIZE, clipCheckPoints, qcAvSync, qcClips, qcMaster, type ClipVerdict } from './montageAsk';
import { checkManifest, parseAgentRequest, sameManifest, type AgentMontageRequest } from './montageManifest';

/** How many sources the per-clip QC reads at once. */
const QC_CONCURRENCY = 3;

/**
 * Look for every manifest video in the master: one frame per clip from the output (one read of the master) against
 * the same moment of its source, conformed to the master's frame (a read per source, QC_CONCURRENCY at a time).
 */
async function checkClips(deps: MontageExecDeps, request: AgentMontageRequest, masterUrl: string, signal: AbortSignal): Promise<ClipVerdict> {
  const points = clipCheckPoints(request);
  const fit = ASPECT_DIMS[request.aspect];
  const outFrames = (await deps.grabFrames(masterUrl, points.map((p) => p.outT), { size: CLIP_QC_SIZE, signal }).catch(() => null))
    ?? points.map(() => null);
  const srcFrames: Array<Uint8Array | null> = points.map(() => null);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(QC_CONCURRENCY, points.length) }, async () => {
    for (let i = next++; i < points.length; i = next++) {
      if (signal.aborted) return;
      const p = points[i]!;
      const got = await deps.grabFrames(p.url, [p.srcT], { size: CLIP_QC_SIZE, fit, signal }).catch(() => null);
      srcFrames[i] = got?.[0] ?? null;
    }
  }));
  return qcClips(points, outFrames, srcFrames);
}

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
  const run = runIdOf(row);
  const attempt = row.exec?.attempt ?? 1;
  const owe = reserveOf(row) !== null;
  const credits = reserveOf(row)?.credits ?? 0;

  const end = async (error: string, detail: string, result?: Record<string, unknown>): Promise<WorkResult> => {
    if (await fail(deps.store, jobId, worker, error, owe, result)) {
      await deps.audit({ ...run, userId, op: 'montage', phase: 'run', outcome: 'failed', jobId, credits, attempt, detail });
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
      await deps.audit({ ...run, userId, op: 'montage', phase: 'run', outcome: 'cancelled', jobId, attempt, detail: final?.error ?? 'stopped' });
      return { ran: true, outcome: 'stopped' };
    }
    // Another worker holds the row now, or delivered it (this one stalled past its lease). It owns the job.
    await deps.audit({ ...run, userId, op: 'montage', phase: 'run', outcome: 'lost', jobId, attempt, detail: 'lease taken over' });
    return { ran: true, outcome: 'lost' };
  };

  // ── before rendering: the stored plan holds every quoted file, and its manifest is the one stored beside it ──────
  const job = row.params._job as { request?: unknown; manifest?: unknown } | undefined;
  const parsed = parseAgentRequest(job?.request);
  if (!parsed.ok) {
    const what = parsed.code === 'invalid_request' ? 'the stored plan is not valid' : 'the stored plan does not hold every quoted file';
    return end(`${parsed.code}: ${parsed.error}`.slice(0, 300), `${what}: ${parsed.error}`.slice(0, 200));
  }
  const stored = checkManifest(job?.manifest);
  if (!stored.ok || !sameManifest(stored.manifest, parsed.manifest)) {
    const why = stored.ok ? 'the stored manifest differs from the signed one' : stored.error;
    return end(`manifest_invalid: ${why}`.slice(0, 300), `manifest: ${why}`.slice(0, 200));
  }
  const { request, manifest } = parsed;
  const videos = manifest.filter((m) => m.kind === 'video').length;
  const totalSec = timelineDuration(request.shots);
  await deps.audit({ ...run, userId, op: 'montage', phase: 'run', outcome: attempt > 1 ? 'retried' : 'ok', jobId, credits, attempt, detail: 'started' });

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
    const videoUrl = outcome.result.videoUrl;
    const problems: string[] = [];
    if (!outcome.result.hasMusic) problems.push('the music did not mix');
    const qc = qcMaster(await deps.probe(videoUrl), totalSec);
    problems.push(...qc.problems);
    if (ctl.signal.aborted) return halted(beat);
    // The real stream lengths: the soundtrack is there and lasts as long as the picture, the picture as the plan.
    const av = qcAvSync(await deps.streamDurations(videoUrl, { signal: ctl.signal }).catch(() => null), totalSec);
    problems.push(...av.problems);
    if (ctl.signal.aborted) return halted(beat);
    // Every video of the manifest really in the master (the owner's invariant): its frame, at its place.
    const clips = await checkClips(deps, request, videoUrl, ctl.signal);
    if (ctl.signal.aborted) return halted(beat);
    const seen = new Set(clips.clips.map((c) => c.index));
    const unplaced = manifest.filter((m) => m.kind === 'video' && !seen.has(m.index));
    problems.push(...clips.problems, ...unplaced.map((m) => `clip ${m.index + 1} "${m.name}" has no place in the output`));
    const evidence = {
      qc: {
        files: manifest.length,
        videos,
        clips: clips.clips,
        maxDiff: CLIP_QC_MAX_DIFF,
        av: { videoSec: av.videoSec, audioSec: av.audioSec },
        durationSec: qc.durationSec,
        ok: problems.length === 0,
      },
    };
    if (problems.length) {
      // A master missing a clip is the owner's "not a completed task": its own code, so the chat can say so.
      const code = clips.missing.length || unplaced.length ? 'clip_missing' : 'qc_failed';
      return end(`${code}: ${problems.join('; ')}`.slice(0, 300), `qc: ${problems.join('; ')}`.slice(0, 200), evidence);
    }

    const delivered = await complete(deps.store, jobId, worker, {
      signedUrl: videoUrl,
      result: { videoUrl, subtype: 'montage', via: 'agent-g', durationSec: qc.durationSec, aspect: request.aspect, ...evidence },
    });
    if (!delivered) return halted(await afterLoss());
    await deps.audit({ ...run, userId, op: 'montage', phase: 'run', outcome: 'ok', jobId, credits, attempt, durationSec: qc.durationSec, detail: 'delivered' });
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
  /** Debts this sweep tried and could not pay: money still owed to a user (the sweep's alert, PART 5 O1). */
  stillOwed: string[];
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
  const report: SweepReport = { gaveUp: [], paid: [], stillOwed: [], waiting: r.runnable };
  for (const row of r.exhausted) {
    report.gaveUp.push(row.id);
    await deps.audit({ ...runIdOf(row), userId: row.userId, op: 'montage', phase: 'run', outcome: 'failed', jobId: row.id, attempt: row.exec?.attempt, detail: row.error ?? 'gave up' });
  }
  for (const row of await deps.store.listOwed(MONTAGE_KIND, 25)) {
    await payDebt(deps, row);
    const after = await deps.store.read(row.id);
    if (after && !after.exec?.owe) report.paid.push(row.id);
    else report.stillOwed.push(row.id);
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
