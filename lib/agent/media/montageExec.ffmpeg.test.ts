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

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { analyzeTrack, probeMedia } from '../../services/montage/beatAnalysis';
import { runMontage } from '../../services/montage/montagePipeline';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { cancelMontageJob, enqueueMontageJob, quoteMontage, type MontageExecDeps } from './montageExec';
import { workMontageJob } from './montageWorker';

jest.setTimeout(180_000);
const bin = ffmpegStatic as unknown as string;
let dir = '';

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  mockFiles.set(`https://media.test/in/${name}`, out);
  return `https://media.test/in/${name}`;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-montage-'));
  mockOut = dir;
});

/** The live wiring (montageLive) with the database, ledger and clock local. `beat` fires the heartbeat by hand. */
let beat: () => Promise<void> = async () => {};
function liveLike(store: ReturnType<typeof memoryLeaseStore>, audits: string[], onStage?: (step: string) => void): MontageExecDeps {
  let ids = 0;
  return {
    resolveFile: async (ref) => ({ ok: true, url: ref }),
    probe: (url) => probeMedia(url),
    analyzeTrack: (url) => analyzeTrack(url),
    render: (req, o) => runMontage(req, { jobId: o.jobId, signal: o.signal, onStage: async (step, pct) => { onStage?.(step); return o.onStage(step, pct); } }),
    store,
    billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), refund: async () => 'nothing' },
    audit: async (ev) => { audits.push(`${ev.phase}:${ev.outcome}${ev.detail ? `:${ev.detail}` : ''}`); },
    key: () => 'test-key',
    now: () => Date.now(),
    newId: () => (ids++ === 0 ? 'e2e-job' : `e2e-job-${ids}`),
    every: (_ms, tick) => { beat = tick; return () => { beat = async () => {}; }; },
  };
}
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** PIDs of the conform pass's ffmpeg (fitAspect writes into a remix-fit-* temp dir). */
function encoders(): number[] {
  try {
    return execFileSync('pgrep', ['-f', `^${bin} .*remix-fit-`]).toString().trim().split('\n').map(Number).filter(Boolean);
  } catch {
    return []; // pgrep exits 1 when nothing matches
  }
}
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test('three clips + a 120 BPM track → a beat-cut H.264/AAC master of the planned length, with the music', async () => {
  const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
  const a = make('a.mp4', ['-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=30:duration=7', '-f', 'lavfi', '-i', 'sine=f=300:duration=7', ...enc]);
  const b = make('b.mp4', ['-f', 'lavfi', '-i', 'smptebars=size=360x640:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=f=500:duration=6', ...enc]);
  const c = make('c.mp4', ['-f', 'lavfi', '-i', 'rgbtestsrc=size=640x360:rate=30:duration=6', ...enc.slice(0, 6)]);
  // A kick every 0.5 s from 0.25 s (120 BPM) over a quiet pad: the beat the analysis must find.
  const song = make('song.m4a', [
    '-f', 'lavfi', '-i',
    "aevalsrc='0.9*sin(2*PI*55*t)*exp(-30*mod(t-0.25+1,0.5))*gte(t,0.25)+0.05*sin(2*PI*220*t)':s=44100:d=20",
    '-c:a', 'aac',
  ]);

  const store = memoryLeaseStore();
  const audits: string[] = [];
  const deps = liveLike(store, audits);
  const q = await quoteMontage(deps, { userId: 'u', files: [a, b, c, song], targetSec: 10 });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.quote.beatSynced).toBe(true);
  expect(Math.abs(q.quote.bpm! - 120)).toBeLessThan(1.5);
  expect(Math.abs(q.quote.musicStartSec - 0.25)).toBeLessThan(0.05);
  expect(q.quote.clips).toBe(3);
  expect(q.quote.totalSec).toBeLessThanOrEqual(10);

  const queued = await enqueueMontageJob(deps, { userId: 'u', request: q.request, token: q.token, prompt: 'cut these to the song' });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  const r = await workMontageJob(deps, { jobId: queued.jobId, worker: 'w-e2e' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get('e2e-job')?.error ?? ''}`);
  const master = await probeMedia(r.videoUrl);
  expect(master).toMatchObject({ hasVideo: true, hasAudio: true, videoCodec: 'h264', audioCodec: 'aac' });
  expect(Math.abs(master!.durationSec - q.quote.totalSec)).toBeLessThan(1);
  expect(store.rows.get('e2e-job')).toMatchObject({ status: 'completed', exec: { attempt: 1 } });
  expect(store.writes.progress).toBeGreaterThanOrEqual(4); // resolve, bridge, normalize, stitch (+ music), under the lease
  expect(audits).toEqual(['quote:ok', 'run:ok:queued', 'run:ok:started', 'run:ok:delivered']);
  // MONTAGE_E2E_OUT=<file> records the plan and the master as the slice's proof (docs/handoffs).
  if (process.env.MONTAGE_E2E_OUT) {
    writeFileSync(process.env.MONTAGE_E2E_OUT, JSON.stringify({ quote: q.quote, shots: q.request.shots.map((s) => [s.url.split('/').pop(), s.startSec, s.endSec]), master }, null, 1));
  }
});

test('a cancel during the conform leg kills its ffmpeg: the worker stops within a second and delivers nothing', async () => {
  // One long 720p clip, so the conform pass (fitAspect to 9:16) runs for seconds: the cancel lands while it encodes.
  const enc = ['-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
  const long = make('long.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=40', '-f', 'lavfi', '-i', 'sine=f=400:duration=40', ...enc]);
  const song = make('song2.m4a', ['-f', 'lavfi', '-i', 'sine=f=200:duration=40', '-c:a', 'aac']);
  const store = memoryLeaseStore();
  const audits: string[] = [];
  let conforming: () => void = () => {};
  const reached = new Promise<void>((r) => { conforming = r; });
  const deps = liveLike(store, audits, (step) => { if (step === 'normalize') conforming(); });

  const q = await quoteMontage(deps, { userId: 'u', files: [long, song], aspect: '9:16', targetSec: 30 });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  const queued = await enqueueMontageJob(deps, { userId: 'u', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(queued.error);
  const run = workMontageJob(deps, { jobId: queued.jobId, worker: 'w-cancel' });
  await reached;
  await new Promise((r) => setTimeout(r, 300));
  const conform = encoders();
  expect(conform.length).toBeGreaterThan(0); // the conform ffmpeg is running now
  expect(await cancelMontageJob(deps, { userId: 'u', jobId: queued.jobId })).toEqual({ ok: true });
  const t0 = Date.now();
  await beat();
  expect(await run).toEqual({ ran: true, outcome: 'stopped' });
  expect(Date.now() - t0).toBeLessThan(1_500);
  expect(store.rows.get(queued.jobId)).toMatchObject({ status: 'failed', error: 'cancelled by the user', signedUrl: null });
  expect(conform.filter(alive)).toEqual([]); // the encoder was killed, not left to finish
});
