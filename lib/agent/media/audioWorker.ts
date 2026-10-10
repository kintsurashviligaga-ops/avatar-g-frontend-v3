/**
 * lib/agent/media/audioWorker.ts — the worker side of Agent G's audio extraction (./audioExtract), on the same lease
 * queue as the montage (lib/orchestrator/jobLease):
 *
 *   work    claim the row → renew the lease every HEARTBEAT_MS while ffmpeg takes the file and makes the MP3 → QC it →
 *           store it → complete the row. The heartbeat is also how the worker hears that the owner cancelled (or that
 *           the sweep gave the job up): it aborts, which kills the running ffmpeg (lib/video/ffmpegExec), and nothing is
 *           delivered. A source that is gone, has no sound or fails QC is final at once. A worker that DIES stops
 *           renewing; its lease lapses and the next worker retries the job once.
 *   sweep   fail the rows whose last attempt died, and hand one waiting job to a worker (app/api/agent/media/sweep).
 *
 * Before ffmpeg sees anything the source is checked again, as it is now: a link must still pass the source rule (and
 * every redirect hop is held to it while it downloads, inside the live `extract`), and a file must still be the
 * caller's own upload. Every write is fenced by the lease, as in ./montageWorker.
 */
import { HEARTBEAT_MS, claim, complete, fail, heartbeat, reap, type Beat } from '@/lib/orchestrator/jobLease';
import { AUDIO_KIND, qcMp3, validateAudioRequest, type AudioExecDeps } from './audioExtract';
import { runIdOf } from './montageExec';
import { classifySource } from './audioSource';

export type AudioWorkResult =
  | { ran: false; reason: string }
  | { ran: true; outcome: 'delivered'; audioUrl: string }
  | { ran: true; outcome: 'failed'; error: string }
  | { ran: true; outcome: 'stopped' | 'lost' };

/** Extract one queued job, if this worker can claim it. Never throws. */
export async function workAudioJob(deps: AudioExecDeps, input: { jobId: string; worker: string }): Promise<AudioWorkResult> {
  const { jobId, worker } = input;
  const c = await claim(deps.store, jobId, worker, deps.now());
  if (!c.ok) return { ran: false, reason: c.reason };
  const row = c.row;
  const userId = row.userId;
  const run = runIdOf(row);
  const attempt = row.exec?.attempt ?? 1;

  const afterLoss = async (): Promise<Beat> => ((await deps.store.read(jobId))?.status === 'failed' ? 'stopped' : 'lost');
  const halted = async (beat: Beat): Promise<AudioWorkResult> => {
    const stopped = beat === 'stopped';
    await deps.audit({ ...run, userId, op: 'audio_extract', phase: 'run', outcome: stopped ? 'cancelled' : 'lost', jobId, attempt, detail: stopped ? 'stopped' : 'lease taken over' });
    return { ran: true, outcome: stopped ? 'stopped' : 'lost' };
  };
  const end = async (error: string): Promise<AudioWorkResult> => {
    const e = error.slice(0, 300);
    if (await fail(deps.store, jobId, worker, e, false)) {
      await deps.audit({ ...run, userId, op: 'audio_extract', phase: 'run', outcome: 'failed', jobId, attempt, detail: e.slice(0, 200) });
      return { ran: true, outcome: 'failed', error: e };
    }
    return halted(await afterLoss());
  };

  const request = validateAudioRequest((row.params._job as { request?: unknown } | undefined)?.request);
  if (!request) return end('invalid_request: the stored plan is not valid');
  await deps.audit({ ...run, userId, op: 'audio_extract', phase: 'run', outcome: attempt > 1 ? 'retried' : 'ok', jobId, attempt, detail: 'started' });

  // ── the source, checked again as it is now ─────────────────────────────────────────────────────────────────────
  let url: string;
  if (request.source.kind === 'link') {
    const v = classifySource(request.source.url);
    if (!v.ok) return end(v.reason === 'platform' ? `platform: ${v.platform}` : `${v.reason}: the link is not allowed`);
    url = v.url;
  } else {
    const r = await deps.resolveFile(request.source.ref, userId);
    if (!r.ok) return end(r.reason === 'not_yours' ? 'media_not_yours: not the caller\'s upload' : 'unreadable: the upload cannot be read');
    url = r.url;
  }

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
    await deps.store.progress(jobId, worker, 'extract', 10);
    let out;
    try {
      out = await deps.extract(url, { signal: ctl.signal, maxSec: request.maxSec, title: request.name.replace(/\.mp3$/, '') });
    } catch (e) {
      out = { ok: false as const, error: 'extract_failed' as const, detail: e instanceof Error ? e.message : 'extract failed' };
    }
    if (ctl.signal.aborted) return halted(beat);
    if (!out.ok) {
      const detail = out.error === 'platform' && out.platform ? out.platform : out.detail ?? '';
      return end(`${out.error}: ${detail}`.trim());
    }
    if (out.input.durationSec > request.maxSec + 1) return end(`too_long: ${Math.round(out.input.durationSec)} s`);

    // ── QC before delivery ───────────────────────────────────────────────────────────────────────────────────────
    await deps.store.progress(jobId, worker, 'qc', 80);
    const qc = qcMp3(out.output, out.input, out.mp3.byteLength, request.maxSec);
    if (!qc.ok) return end(`qc_failed: ${qc.problems.join('; ')}`);

    // Still ours? A worker that stalled past its lease (the job retried elsewhere, or given up) stores nothing.
    const still = await heartbeat(deps.store, jobId, worker, deps.now());
    if (still !== 'held') return halted(still);
    await deps.store.progress(jobId, worker, 'upload', 90);
    const audioUrl = await deps.upload(jobId, out.mp3).catch(() => null);
    if (ctl.signal.aborted) return halted(beat);
    if (!audioUrl) return end('upload_failed: storage refused the MP3');

    // Not a Library item until the user saves it (no signed_url, no result.url): see ./audioExtract.
    const delivered = await complete(deps.store, jobId, worker, {
      signedUrl: null,
      result: {
        audioUrl,
        name: request.name,
        durationSec: Math.round(qc.durationSec * 100) / 100,
        bytes: out.mp3.byteLength,
        bitrateKbps: request.bitrateKbps,
        codec: 'mp3',
        subtype: 'audio-extract',
        via: 'agent-g',
        source: request.source.kind,
        rights: request.rights,
      },
    });
    if (!delivered) return halted(await afterLoss());
    await deps.audit({ ...run, userId, op: 'audio_extract', phase: 'run', outcome: 'ok', jobId, attempt, durationSec: qc.durationSec, detail: `delivered ${out.mp3.byteLength} bytes` });
    return { ran: true, outcome: 'delivered', audioUrl };
  } finally {
    stopBeating();
  }
}

export const AUDIO_GAVE_UP = 'extract_failed: the worker stopped twice and the job was not retried again';

export interface AudioSweepReport {
  gaveUp: string[];
  waiting: string[];
  worked?: { jobId: string; result: AudioWorkResult };
}

/** Fail the rows whose attempts ran out, then (when `work`) run the oldest waiting job here. Never throws. */
export async function sweepAudioJobs(deps: AudioExecDeps, opts: { worker: string; work: boolean }): Promise<AudioSweepReport> {
  const r = await reap(deps.store, AUDIO_KIND, deps.now(), { owesRefund: () => false, error: AUDIO_GAVE_UP, abandonedError: AUDIO_GAVE_UP });
  const report: AudioSweepReport = { gaveUp: [], waiting: r.runnable };
  for (const row of r.exhausted) {
    report.gaveUp.push(row.id);
    await deps.audit({ ...runIdOf(row), userId: row.userId, op: 'audio_extract', phase: 'run', outcome: 'failed', jobId: row.id, attempt: row.exec?.attempt, detail: row.error ?? 'gave up' });
  }
  if (opts.work) {
    for (const jobId of r.runnable) {
      const result = await workAudioJob(deps, { jobId, worker: opts.worker });
      if (result.ran) {
        report.worked = { jobId, result };
        break;
      }
    }
  }
  return report;
}
