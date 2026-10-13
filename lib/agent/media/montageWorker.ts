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
import { OUTPUT_FPS } from '@/lib/services/montage/beatPlan';
import type { MontageOutcome } from '@/lib/services/montage/montagePipeline';
import { ASPECT_DIMS, timelineDuration } from '@/lib/services/montage/montagePlan';
import { HEARTBEAT_MS, claim, complete, fail, heartbeat, mustStop, reap, type Beat, type LeaseRow } from '@/lib/orchestrator/jobLease';
import { MONTAGE_KIND, payDebt, reserveOf, runIdOf, type MontageExecDeps } from './montageExec';
import { CLIP_QC_MAX_DIFF, CLIP_QC_SIZE, audioTiming, clipCheckPoints, frameDiff, qcAvSync, qcClips, qcMaster, sourceContribution, type ClipVerdict, type QcOutcome } from './montageAsk';
import { checkManifest, isPictureKind, parseAgentRequest, sameManifest, type AgentMontageRequest } from './montageManifest';

/** How many sources the per-clip QC reads at once. */
const QC_CONCURRENCY = 3;

/**
 * Look for every manifest video and photo in the master: one frame per picture from the output (one read of the master)
 * against the same moment of its source, conformed to the master's frame (a read per source, QC_CONCURRENCY at a time).
 * A video's source is read at that moment and every half output frame up to ±SRC_QC_REACH_SEC around it, and the
 * closest frame counts (its time is kept as `matchT`): the stitch resamples to OUTPUT_FPS, so the frame the master
 * shows can be the source's frame half an output frame after the planned moment, and in fast motion that alone is a
 * large difference. Measured on real ffmpeg (a 60 fps panning clip, 2026-10-11): 6.51 at the planned moment, 0.19 at
 * +1/60 s, which the earlier ±1/30 s reads stepped over. Real clips read 11.96 (Production 12:07Z) and 11.79 (Preview
 * 12:34Z) against the limit of 12 that way. A clip that is not there differs from every one of them.
 */
async function checkClips(deps: MontageExecDeps, request: AgentMontageRequest, masterUrl: string, signal: AbortSignal): Promise<ClipVerdict> {
  const points = clipCheckPoints(request);
  const fit = ASPECT_DIMS[request.aspect];
  const outFrames = (await deps.grabFrames(masterUrl, points.map((p) => p.outT), { size: CLIP_QC_SIZE, signal }).catch(() => null))
    ?? points.map(() => null);
  const srcFrames: Array<Uint8Array | null> = points.map(() => null);
  const matchT: Array<number | null> = points.map(() => null);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(QC_CONCURRENCY, points.length) }, async () => {
    for (let i = next++; i < points.length; i = next++) {
      if (signal.aborted) return;
      const p = points[i]!;
      const times = srcQcTimes(p.srcT);
      const got = await deps.grabFrames(p.url, times, { size: CLIP_QC_SIZE, fit, signal }).catch(() => null);
      // The candidate closest to the output frame; the planned moment (listed first) wins a tie.
      const out = outFrames[i] ?? null;
      let best = -1;
      (got ?? []).forEach((f, k) => { if (f && (best < 0 || frameDiff(out, f) < frameDiff(out, got![best]))) best = k; });
      srcFrames[i] = best >= 0 ? got![best]! : null;
      matchT[i] = best >= 0 ? times[best]! : null;
    }
  }));
  const verdict = qcClips(points, outFrames, srcFrames);
  return { ...verdict, clips: verdict.clips.map((c, i) => (matchT[i] != null && matchT[i] !== c.srcT ? { ...c, matchT: matchT[i]! } : c)) };
}

/** How far around the planned moment a video's source is searched (see checkClips): three half output frames. */
const SRC_QC_REACH_SEC = 3 / (2 * OUTPUT_FPS);

/** The source moments one clip is checked at: the planned one first, then out by half output frames, never below 0. */
export function srcQcTimes(srcT: number): number[] {
  if (!(srcT > 0)) return [0];
  const half = 1 / (2 * OUTPUT_FPS);
  const out = [srcT];
  for (let k = 1; k * half <= SRC_QC_REACH_SEC + 1e-9; k += 1) out.push(srcT - k * half, srcT + k * half);
  return out.filter((t) => t > 0).map((t) => Math.round(t * 1000) / 1000);
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
  const stills = manifest.filter((m) => m.kind === 'image').length;
  const totalSec = timelineDuration(request.shots);
  await deps.audit({ ...run, userId, op: 'montage', phase: 'run', outcome: attempt > 1 ? 'retried' : 'ok', jobId, credits, attempt, detail: 'started' });

  // ── the heartbeat: renews the lease, and is how this worker hears it must stop ───────────────────────────────────
  const ctl = new AbortController();
  let beat: Beat = 'held';
  const stopBeating = deps.every(HEARTBEAT_MS, async () => {
    if (ctl.signal.aborted) return;
    const b = await heartbeat(deps.store, jobId, worker, deps.now());
    if (mustStop(b)) {
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
    // Its own stage, so the card shows the check running (and, on a failure, that the check is where it stopped).
    await deps.store.progress(jobId, worker, 'qc', 97).catch(() => false);
    const videoUrl = outcome.result.videoUrl;
    const problems: string[] = [];
    // The sound the user started: the music when the manifest lists one, the narration when it lists one (a montage
    // without music keeps the clips' own sound, and has no track to check for).
    if (request.musicUrl && !outcome.result.hasMusic) problems.push('the music did not mix');
    if (request.voiceUrl && !outcome.result.hasVoice) problems.push('the narration did not mix');
    const qc = qcMaster(await deps.probe(videoUrl), totalSec);
    problems.push(...qc.problems);
    if (ctl.signal.aborted) return halted(beat);
    // The real stream lengths: the soundtrack is there and lasts as long as the picture, the picture as the plan.
    const av = qcAvSync(await deps.streamDurations(videoUrl, { signal: ctl.signal }).catch(() => null), totalSec);
    problems.push(...av.problems);
    if (ctl.signal.aborted) return halted(beat);
    // Every video and photo of the manifest really in the master (the owner's invariant): its frame, at its place.
    const clips = await checkClips(deps, request, videoUrl, ctl.signal);
    if (ctl.signal.aborted) return halted(beat);
    const seen = new Set(clips.clips.map((c) => c.index));
    const unplaced = manifest.filter((m) => isPictureKind(m.kind) && !seen.has(m.index));
    problems.push(...clips.problems, ...unplaced.map((m) => `clip ${m.index + 1} "${m.name}" has no place in the output`));
    const evidence = {
      qc: {
        files: manifest.length,
        videos,
        ...(stills ? { stills } : {}),
        clips: clips.clips,
        maxDiff: CLIP_QC_MAX_DIFF,
        av: { videoSec: av.videoSec, audioSec: av.audioSec, videoFrames: av.videoFrames, plannedFrames: av.plannedFrames },
        durationSec: qc.durationSec,
        ok: problems.length === 0,
        outcome: (problems.length === 0 ? 'PASS' : 'FAIL') as QcOutcome,
        // Provenance (Media Studio v2.0 §6): what each source fills in the master, from the rendered shots, and the
        // two audio clocks (the track's offset, the master's timeline) the master was made with.
        sources: sourceContribution(request),
        audio: audioTiming(request),
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
