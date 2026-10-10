/**
 * lib/agent/media/editWorker.ts — the worker side of Agent G's edit (./editExec), on the same lease queue as the montage
 * and the MP3 (lib/orchestrator/jobLease), the same way as ./audioWorker:
 *
 *   work    claim the row → renew the lease every HEARTBEAT_MS while ffmpeg edits the file → QC it → store it →
 *           complete the row. The heartbeat is also how the worker hears that the owner cancelled (or that the sweep
 *           gave the job up): it aborts, which kills the running ffmpeg, and nothing is delivered. A source that is not
 *           the caller's any more, has changed, or fails QC is final at once. A worker that DIES stops renewing; its
 *           lease lapses and the next worker retries the job once.
 *   sweep   fail the rows whose last attempt died, and hand one waiting job to a worker (app/api/agent/media/sweep).
 */
import { HEARTBEAT_MS, claim, complete, fail, heartbeat, reap, type Beat } from '@/lib/orchestrator/jobLease';
import { EDIT_KIND, type EditExecDeps } from './editExec';
import { qcEdit, validateEditRequest } from './editPlan';
import { runIdOf } from './montageExec';

export type EditWorkResult =
  | { ran: false; reason: string }
  | { ran: true; outcome: 'delivered'; url: string }
  | { ran: true; outcome: 'failed'; error: string }
  | { ran: true; outcome: 'stopped' | 'lost' };

/** A source whose length moved by more than this since the quote is not the file the user saw planned. */
const SOURCE_DRIFT_SEC = 1;

/** Edit one queued job, if this worker can claim it. Never throws. */
export async function workEditJob(deps: EditExecDeps, input: { jobId: string; worker: string }): Promise<EditWorkResult> {
  const { jobId, worker } = input;
  const c = await claim(deps.store, jobId, worker, deps.now());
  if (!c.ok) return { ran: false, reason: c.reason };
  const row = c.row;
  const userId = row.userId;
  const run = runIdOf(row);
  const attempt = row.exec?.attempt ?? 1;

  const afterLoss = async (): Promise<Beat> => ((await deps.store.read(jobId))?.status === 'failed' ? 'stopped' : 'lost');
  const halted = async (beat: Beat): Promise<EditWorkResult> => {
    const stopped = beat === 'stopped';
    await deps.audit({ ...run, userId, op: 'media_edit', phase: 'run', outcome: stopped ? 'cancelled' : 'lost', jobId, attempt, detail: stopped ? 'stopped' : 'lease taken over' });
    return { ran: true, outcome: stopped ? 'stopped' : 'lost' };
  };
  const end = async (error: string): Promise<EditWorkResult> => {
    const e = error.slice(0, 300);
    if (await fail(deps.store, jobId, worker, e, false)) {
      await deps.audit({ ...run, userId, op: 'media_edit', phase: 'run', outcome: 'failed', jobId, attempt, detail: e.slice(0, 200) });
      return { ran: true, outcome: 'failed', error: e };
    }
    return halted(await afterLoss());
  };

  const request = validateEditRequest((row.params._job as { request?: unknown } | undefined)?.request);
  if (!request) return end('invalid_request: the stored plan is not valid');
  await deps.audit({ ...run, userId, op: 'media_edit', phase: 'run', outcome: attempt > 1 ? 'retried' : 'ok', jobId, attempt, detail: 'started' });

  // ── the source, checked again as it is now: still the caller's own ─────────────────────────────────────────────
  const src = await deps.resolveFile(request.source.ref, userId);
  if (!src.ok) return end(src.reason === 'not_yours' ? 'media_not_yours: not the caller\'s file' : 'unreadable: the file cannot be read');

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
    await deps.store.progress(jobId, worker, 'render', 10);
    let out;
    try {
      out = await deps.render(src.url, request, { signal: ctl.signal });
    } catch (e) {
      out = { ok: false as const, error: 'render_failed' as const, detail: e instanceof Error ? e.message : 'render failed' };
    }
    if (ctl.signal.aborted) return halted(beat);
    if (!out.ok) return end(`${out.error}: ${out.detail ?? ''}`.trim());
    if (Math.abs(out.input.durationSec - request.plan.sourceSec) > SOURCE_DRIFT_SEC) {
      return end(`source_changed: ${out.input.durationSec.toFixed(1)} s now, ${request.plan.sourceSec} s when quoted`);
    }

    // ── QC before delivery ───────────────────────────────────────────────────────────────────────────────────────
    await deps.store.progress(jobId, worker, 'qc', 80);
    const qc = qcEdit(out.output, request.plan, out.bytes.byteLength);
    if (!qc.ok) return end(`qc_failed: ${qc.problems.join('; ')}`);

    // Still ours? A worker that stalled past its lease (the job retried elsewhere, or given up) stores nothing.
    const still = await heartbeat(deps.store, jobId, worker, deps.now());
    if (still !== 'held') return halted(still);
    await deps.store.progress(jobId, worker, 'upload', 90);
    const url = await deps.upload(jobId, out.bytes, request.plan.output).catch(() => null);
    if (ctl.signal.aborted) return halted(beat);
    if (!url) return end('upload_failed: storage refused the result');

    // Filed like the montage: the row's signed_url puts it in the Library and the tray.
    const delivered = await complete(deps.store, jobId, worker, {
      signedUrl: url,
      result: {
        url,
        ...(request.plan.output === 'jpg' ? { imageUrl: url } : { videoUrl: url }),
        output: request.plan.output,
        name: request.name,
        durationSec: Math.round(qc.durationSec * 100) / 100,
        width: request.plan.width,
        height: request.plan.height,
        bytes: out.bytes.byteLength,
        subtype: request.plan.output === 'jpg' ? 'thumbnail' : 'edit',
        via: 'agent-g',
        edits: request.edits.map((e) => e.op),
      },
    });
    if (!delivered) return halted(await afterLoss());
    await deps.audit({ ...run, userId, op: 'media_edit', phase: 'run', outcome: 'ok', jobId, attempt, durationSec: qc.durationSec, detail: `delivered ${out.bytes.byteLength} bytes` });
    return { ran: true, outcome: 'delivered', url };
  } finally {
    stopBeating();
  }
}

export const EDIT_GAVE_UP = 'render_failed: the worker stopped twice and the job was not retried again';

export interface EditSweepReport {
  gaveUp: string[];
  waiting: string[];
  worked?: { jobId: string; result: EditWorkResult };
}

/** Fail the rows whose attempts ran out, then (when `work`) run the oldest waiting job here. Never throws. */
export async function sweepEditJobs(deps: EditExecDeps, opts: { worker: string; work: boolean }): Promise<EditSweepReport> {
  const r = await reap(deps.store, EDIT_KIND, deps.now(), { owesRefund: () => false, error: EDIT_GAVE_UP, abandonedError: EDIT_GAVE_UP });
  const report: EditSweepReport = { gaveUp: [], waiting: r.runnable };
  for (const row of r.exhausted) {
    report.gaveUp.push(row.id);
    await deps.audit({ ...runIdOf(row), userId: row.userId, op: 'media_edit', phase: 'run', outcome: 'failed', jobId: row.id, attempt: row.exec?.attempt, detail: row.error ?? 'gave up' });
  }
  if (opts.work) {
    for (const jobId of r.runnable) {
      const result = await workEditJob(deps, { jobId, worker: opts.worker });
      if (result.ran) {
        report.worked = { jobId, result };
        break;
      }
    }
  }
  return report;
}
