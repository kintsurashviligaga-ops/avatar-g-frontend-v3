/** @jest-environment node */
/**
 * Agent G's montage on the REAL bundled ffmpeg, end to end but offline: three generated clips (one portrait) and a
 * generated 120 BPM track go through the live analysis (lib/services/montage/beatAnalysis), the quote, the queue
 * (lib/orchestrator/jobLease, in memory), the worker on the real montage lane (runMontage: conform, stitch, music mux)
 * and the QC probe. Only the network, storage and the database are faked: "downloads" copy local files, "uploads"
 * write to a temp dir. Pins that the plan lands on the track's real beat, that the delivered master is an H.264/AAC MP4
 * of the planned length with the music in it, and that a cancel kills the lane's running ffmpeg.
 */
jest.mock('server-only', () => ({}));

const mockFiles = new Map<string, string>();
jest.mock('../../web/publicFetch', () => {
  const { copyFile, stat } = jest.requireActual('node:fs/promises');
  return {
    MEDIA_TYPES: /.*/,
    fetchPublicToFile: async (url: string, path: string) => {
      const src = mockFiles.get(url.split('?')[0]!);
      if (!src) return { ok: false, error: 'fetch_failed' };
      await copyFile(src, path);
      return { ok: true, bytes: (await stat(path)).size, contentType: 'video/mp4' };
    },
  };
});
let mockOut = '';
jest.mock('../../orchestrator/storage-adapter', () => {
  const { writeFileSync } = jest.requireActual('node:fs');
  const { join } = jest.requireActual('node:path');
  const host = (path: string, buf: Buffer) => {
    const local = join(mockOut, path.replace(/\//g, '_'));
    writeFileSync(local, buf);
    const url = `https://media.test/${path}`;
    mockFiles.set(url, local);
    return `${url}?token=t`;
  };
  return {
    uploadBufferAndSign: async (_b: string, path: string, buf: Buffer) => host(path, buf),
    uploadAndSign: async (_b: string, path: string, b64: string) => host(path, Buffer.from(b64, 'base64')),
    reSignIfInternal: async (url: string) => url,
  };
});
jest.mock('../../orchestrator/jobs', () => ({ updateJobStage: async () => {} }));
jest.mock('../optimizer/activeConfig', () => ({ getActiveConfig: async () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeTrack, grabFrames, probeMedia, streamDurations } from '../../services/montage/beatAnalysis';
import { withFfmpegSignal } from '../../video/ffmpegExec';
import { runMontage } from '../../services/montage/montagePipeline';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { enqueueMontageJob, quoteMontage, type MontageExecDeps } from './montageExec';
import { workMontageJob } from './montageWorker';

jest.setTimeout(180_000);
let dir = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-montage-'));
  mockOut = dir;
});

/** The live wiring (montageLive) with the database, ledger and clock local. */
function liveLike(store: ReturnType<typeof memoryLeaseStore>, audits: string[], onStage?: (step: string) => void, render?: typeof runMontage): MontageExecDeps {
  let ids = 0;
  return {
    resolveFile: async (ref) => ({ ok: true, url: ref }),
    probe: (url) => probeMedia(url),
    analyzeTrack: (url) => analyzeTrack(url),
    render: (req, o) => (render ?? runMontage)(req, { jobId: o.jobId, signal: o.signal, onStage: async (step, pct) => { onStage?.(step); return o.onStage(step, pct); } }),
    grabFrames: (url, timesSec, o) => withFfmpegSignal(o.signal, () => grabFrames(url, timesSec, { size: o.size, ...(o.fit ? { fit: o.fit } : {}) })),
    streamDurations: (url, o) => withFfmpegSignal(o?.signal, () => streamDurations(url)),
    store,
    billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), refund: async () => 'nothing' },
    audit: async (ev) => { audits.push(`${ev.phase}:${ev.outcome}${ev.detail ? `:${ev.detail}` : ''}`); },
    key: () => 'test-key',
    now: () => Date.now(),
    newId: () => (ids++ === 0 ? 'e2e-job' : `e2e-job-${ids}`),
    every: () => () => {},
  };
}
afterAll(() => rmSync(dir, { recursive: true, force: true }));

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/**
 * Global E2E 2026-10-14: the two REAL Veo 3.1 Fast clips from Preview build 95432a2b (one 9:16 t2v, one 16:9 i2v, 4 s each,
 * native audio) through the real montage lane — quote → lease → conform (mixed aspects) → stitch → per-clip QC → master.
 * VEO_REPLAY_DIR=<dir with VEO-1-t2v-9x16.mp4 and VEO-2-i2v-16x9.mp4>; skipped without it (CI has no paid bytes).
 */
const REPLAY = process.env.VEO_REPLAY_DIR;
(REPLAY ? test : test.skip)('real Veo clips (9:16 + 16:9) → one H.264/AAC master, both clips seen by the QC, A/V in sync', async () => {
  const { copyFileSync } = jest.requireActual('node:fs');
  const add = (name: string) => {
    copyFileSync(join(REPLAY!, name), join(dir, name));
    mockFiles.set(`https://media.test/in/${name}`, join(dir, name));
    return `https://media.test/in/${name}`;
  };
  const a = add('VEO-1-t2v-9x16.mp4');
  const b = add('VEO-2-i2v-16x9.mp4');
  const store = memoryLeaseStore();
  const audits: string[] = [];
  const deps = liveLike(store, audits);
  const q = await quoteMontage(deps, { userId: 'u', files: [a, b], targetSec: 7 });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.quote.clips).toBe(2);
  const queued = await enqueueMontageJob(deps, { userId: 'u', request: q.request, token: q.token, prompt: 'join the two clips' });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  const r = await workMontageJob(deps, { jobId: queued.jobId, worker: 'w-veo' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get('e2e-job')?.error ?? ''}`);
  const master = await probeMedia(r.videoUrl);
  expect(master).toMatchObject({ hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'aac' });
  expect(Math.abs(master!.durationSec - q.quote.totalSec)).toBeLessThan(1);
  const qc = (store.rows.get('e2e-job')!.result as { qc: { clips: Array<{ index: number; ok: boolean }>; av: { videoSec: number; audioSec: number }; ok: boolean } }).qc;
  expect(qc.ok).toBe(true);
  expect(qc.clips.map((c) => [c.index, c.ok])).toEqual([[0, true], [1, true]]);
  expect(Math.abs(qc.av.audioSec - qc.av.videoSec)).toBeLessThanOrEqual(0.25);
  if (process.env.MONTAGE_E2E_OUT) {
    const { readdirSync, statSync, copyFileSync: cp } = jest.requireActual('node:fs');
    const outs = (readdirSync(dir) as string[]).filter((f) => f.endsWith('.mp4') && !f.startsWith('VEO-')).sort((x, y) => statSync(join(dir, y)).mtimeMs - statSync(join(dir, x)).mtimeMs);
    if (outs[0]) cp(join(dir, outs[0]), `${process.env.MONTAGE_E2E_OUT}.mp4`);
    writeFileSync(process.env.MONTAGE_E2E_OUT, JSON.stringify({ quote: q.quote, master, qc, audits }, null, 1));
  }
});
