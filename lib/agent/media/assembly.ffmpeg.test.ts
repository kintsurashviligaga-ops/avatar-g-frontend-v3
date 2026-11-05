/** @jest-environment node */
/**
 * Agent G's intro + body + outro assembly on the REAL bundled ffmpeg, end to end but offline (GG 2026-11-05 09:03Z):
 *
 *   A.mp4  [red intro 2 s, 440 Hz] [black 0.5 s, silent] [yellow outro 2 s, 660 Hz]   — one clip, both bumpers
 *   B.mp4  [black 0.4 s] [grey content to 6.0 s] [black 0.5 s]; its sound is silent to 1.0 s, a tone to 3.0 s, a pause,
 *          the tone again from 3.6 s — exactly on a white flash frame at 3.6 s — to 5.5 s, then silence. The sound TRACK
 *          starts 0.3 s after the picture (an edit-list delay, as phones write it), the case that used to play early.
 *
 * The detection pass (beatAnalysis detectSegments) → the quote (montageExec, assembly) → the queue → the worker on the
 * real montage lane → the QC. Pins: each part is cut where it really starts and ends (no black at the joins, the body's
 * dead silence gone), the master is exactly the parts' frames, picture and sound are the same length, and the tone that
 * restarts on the flash frame is heard ON that frame in the master (A/V sync within one frame + the AAC frame).
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

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { analyzeTrack, detectSegments, grabFrames, probeMedia, streamDurations } from '../../services/montage/beatAnalysis';
import { withFfmpegSignal } from '../../video/ffmpegExec';
import { runMontage } from '../../services/montage/montagePipeline';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { enqueueMontageJob, quoteMontage, type MontageExecDeps } from './montageExec';
import { workMontageJob } from './montageWorker';
import { quoteText } from './montageChat';

jest.setTimeout(240_000);
const bin = ffmpegStatic as unknown as string;
let dir = '';

const ff = (args: string[]) => execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
function file(name: string, path: string): string {
  mockFiles.set(`https://media.test/in/${name}`, path);
  return `https://media.test/in/${name}`;
}
/** The stderr of a null-muxer pass over a local file. */
const pass = (path: string, args: string[]) => spawnSync(bin, ['-hide_banner', '-nostats', '-i', path, ...args, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-assembly-'));
  mockOut = dir;
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function deps(store: ReturnType<typeof memoryLeaseStore>, audits: string[]): MontageExecDeps {
  let ids = 0;
  return {
    resolveFile: async (ref) => ({ ok: true, url: ref }),
    probe: (url) => probeMedia(url),
    analyzeTrack: (url) => analyzeTrack(url),
    detectSegments: (url, probe) => detectSegments(url, probe),
    render: (req, o) => runMontage(req, { jobId: o.jobId, signal: o.signal, onStage: async (step, pct) => o.onStage(step, pct) }),
    grabFrames: (url, timesSec, o) => withFfmpegSignal(o.signal, () => grabFrames(url, timesSec, { size: o.size, ...(o.fit ? { fit: o.fit } : {}) })),
    streamDurations: (url, o) => withFfmpegSignal(o?.signal, () => streamDurations(url)),
    store,
    billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), refund: async () => 'nothing' },
    audit: async (ev) => { audits.push(`${ev.phase}:${ev.outcome}${ev.detail ? `:${ev.detail}` : ''}`); },
    key: () => 'test-key',
    now: () => Date.now(),
    newId: () => (ids++ === 0 ? 'asm-job' : `asm-job-${ids}`),
    every: () => () => {},
  };
}

function makeA(): string {
  const out = join(dir, 'A.mp4');
  ff([
    '-f', 'lavfi', '-i', 'color=red:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2:sample_rate=48000',
    '-f', 'lavfi', '-i', 'color=black:s=640x360:r=30:d=0.5', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono:d=0.5',
    '-f', 'lavfi', '-i', 'color=yellow:s=640x360:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=660:d=2:sample_rate=48000',
    '-filter_complex', '[0:v][1:a][2:v][3:a][4:v][5:a]concat=n=3:v=1:a=1[v][a]', '-map', '[v]', '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out,
  ]);
  return out;
}

function makeB(): string {
  const v = join(dir, 'Bv.mp4'), a = join(dir, 'Ba.m4a'), out = join(dir, 'B.mp4');
  ff([
    '-f', 'lavfi', '-i', 'color=black:s=640x360:r=30:d=0.4',
    '-f', 'lavfi', '-i', "color=gray:s=640x360:r=30:d=5.6,drawbox=enable='between(t,3.2,3.29)':c=white:t=fill",
    '-f', 'lavfi', '-i', 'color=black:s=640x360:r=30:d=0.5',
    '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', v,
  ]);
  // The track's own clock starts 0.3 s late (itsoffset below), so its tone is written 0.3 s earlier than it is heard.
  ff(['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*300*t)*(between(t+0.3,1.0,3.0)+between(t+0.3,3.6,5.5))':s=48000:d=6.2", '-c:a', 'aac', a]);
  ff(['-i', v, '-itsoffset', '0.3', '-i', a, '-map', '0:v', '-map', '1:a', '-c', 'copy', out]);
  return out;
}

test('A + B + A: the parts cut where they really start and end, frame-exact, the sound on its frame', async () => {
  const A = file('A.mp4', makeA());
  const B = file('B.mp4', makeB());
  // The delay this test is about is really in the file: the sound stream starts after the picture.
  expect(spawnSync(bin, ['-hide_banner', '-i', mockFiles.get(B)!], { encoding: 'utf8' }).stderr).toMatch(/Duration: 00:00:06\.5/);

  const store = memoryLeaseStore();
  const audits: string[] = [];
  const d = deps(store, audits);
  const q = await quoteMontage(d, { userId: 'u', files: [A, B], prompt: 'intro, video, outro', assembly: { intro: 0, body: 1, outro: 0 } });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.quote.cutting).toBe('assembly');
  const parts = q.quote.assembly!.parts;
  expect(parts.map((p) => [p.role, p.file])).toEqual([['intro', 0], ['body', 1], ['outro', 0]]);
  const near = (x: number, y: number, tol = 0.07) => Math.abs(x - y) <= tol;
  // Intro: A's start to its black; outro: after the black to A's end.
  expect(near(parts[0]!.startSec, 0) && near(parts[0]!.endSec, 2)).toBe(true);
  expect(parts[0]!.endBy).toBe('black');
  expect(near(parts[2]!.startSec, 2.5) && near(parts[2]!.endSec, 4.45)).toBe(true);
  // Body: the black head and the silence before the voice are gone (1.0 s − pad); the end is the voice's (5.5 s + pad).
  expect(near(parts[1]!.startSec, 0.85)).toBe(true);
  expect(near(parts[1]!.endSec, 5.65)).toBe(true);
  expect([parts[1]!.startBy, parts[1]!.endBy]).toEqual(['speech', 'speech']);
  expect(q.request.shots.map((s) => [s.source, s.muted])).toEqual([[0, false], [1, false], [0, false]]);
  // The card says what was found, in Georgian by default.
  expect(quoteText(q.quote, ['A.mp4', 'B.mp4'], 'ka')).toMatch(/ინტრო: 0–2 წმ \(.*შავი კადრით\).*ძირითადი:.*ხმით.*აუტრო:/);

  const queued = await enqueueMontageJob(d, { userId: 'u', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  const r = await workMontageJob(d, { jobId: queued.jobId, worker: 'w-asm' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  const master = mockFiles.get(r.videoUrl.split('?')[0]!)!;

  // Frame-exact: picture = the parts' frames; sound = picture (no tail, no gap). The per-clip QC saw A and B.
  const planned = q.request.shots.reduce((s, x) => s + Math.round((x.endSec - x.startSec) * 30), 0);
  const sd = await streamDurations(r.videoUrl);
  expect(sd).not.toBeNull();
  expect(Math.abs(sd!.videoSec! - planned / 30)).toBeLessThanOrEqual(1 / 30 + 1e-3);
  expect(Math.abs(sd!.audioSec! - sd!.videoSec!)).toBeLessThanOrEqual(0.05);
  const qc = (store.rows.get(queued.jobId)!.result as { qc: { ok: boolean; clips: Array<{ index: number; ok: boolean }> } }).qc;
  expect(qc.ok).toBe(true);

  // No dead black at the joins: the master opens on the red intro, ends on the yellow outro, and the body's black
  // head and tail are not in it (a black run in the master would be ≥ 0.1 s).
  expect(pass(master, ['-vf', 'blackdetect=d=0.1:pix_th=0.10', '-an'])).not.toMatch(/black_start/);

  // A/V sync: the tone restarts at the flash frame. Body source 3.6 s → master = intro + (3.6 − body start).
  const flashAt = (parts[0]!.endSec - parts[0]!.startSec) + (3.6 - parts[1]!.startSec);
  const log = pass(master, ['-vn', '-af', 'silencedetect=n=-30dB:d=0.3']);
  const restarts = [...log.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const heard = restarts.reduce((best, t) => (Math.abs(t - flashAt) < Math.abs(best - flashAt) ? t : best), Number.POSITIVE_INFINITY);
  // One frame (33 ms) + one AAC frame (23 ms): before the fix the sound came 0.3 s early.
  expect(Math.abs(heard - flashAt)).toBeLessThanOrEqual(0.06);
  // And the picture: the flash frame itself sits at the same master second.
  const flashLog = pass(master, ['-an', '-vf', "select='gt(scene\\,0.2)',showinfo"]);
  const changes = [...flashLog.matchAll(/pts_time:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  expect(changes.some((t) => Math.abs(t - flashAt) <= 1 / 30 + 1e-3)).toBe(true);
  expect(audits).toEqual(['quote:ok', 'run:ok:queued', 'run:ok:started', 'run:ok:delivered']);
});

test('one clip with no break inside cannot be split into intro and outro: refused, with the times as the way out', async () => {
  const out = join(dir, 'flat.mp4');
  ff(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=f=300:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out]);
  const F = file('flat.mp4', out);
  const B = file('B2.mp4', makeB());
  const d = deps(memoryLeaseStore(), []);
  const q = await quoteMontage(d, { userId: 'u', files: [F, B], assembly: { intro: 0, body: 1, outro: 0 } });
  expect(q).toMatchObject({ ok: false, error: 'assembly_no_boundary', files: [0] });
  // With the times given, it plans: intro 0–1.5 s, outro 2.5 s to the end.
  const q2 = await quoteMontage(d, { userId: 'u', files: [F, B], assembly: { intro: 0, body: 1, outro: 0, cuts: { intro: { startSec: 0, endSec: 1.5 }, outro: { startSec: 2.5, endSec: 4 } } } });
  if (!q2.ok) throw new Error(`quote: ${q2.error} ${q2.message}`);
  expect(q2.quote.assembly!.parts.map((p) => [p.role, p.startSec, p.startBy])).toEqual([['intro', 0, 'asked'], ['body', expect.any(Number), 'speech'], ['outro', 2.5, 'asked']]);
});

test('a window from the clip\'s first frame, over a sound track that starts 0.3 s late: the sound stays on its frame', async () => {
  // The case the A/V fix is for (lib/video/surgicalOps: aresample=async=1:first_pts=0 before the trim): a window from 0
  // took the sound from its first SAMPLE and played it from the first frame, 0.3 s early. Grey picture, a white flash
  // at 1.0 s, a tone that starts exactly then; the tone's track begins 0.3 s after the picture.
  const v = join(dir, 'Cv.mp4'), a = join(dir, 'Ca.m4a'), out = join(dir, 'C.mp4');
  ff(['-f', 'lavfi', '-i', "color=gray:s=640x360:r=30:d=3,drawbox=enable='between(t,1.0,1.09)':c=white:t=fill", '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', v]);
  ff(['-f', 'lavfi', '-i', "aevalsrc='0.5*sin(2*PI*300*t)*gte(t+0.3,1.0)':s=48000:d=2.7", '-c:a', 'aac', a]);
  ff(['-i', v, '-itsoffset', '0.3', '-i', a, '-map', '0:v', '-map', '1:a', '-c', 'copy', out]);
  const C = file('C.mp4', out);
  const store = memoryLeaseStore();
  const d = deps(store, []);
  const q = await quoteMontage(d, { userId: 'u', files: [C], assembly: { body: 0, cuts: { body: { startSec: 0, endSec: 2.9 } } } });
  if (!q.ok) throw new Error(`quote: ${q.error} ${q.message}`);
  expect(q.request.shots.map((s) => [s.startSec, s.endSec])).toEqual([[0, 2.9]]);
  const queued = await enqueueMontageJob(d, { userId: 'u', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`run: ${queued.error} ${queued.message}`);
  const r = await workMontageJob(d, { jobId: queued.jobId, worker: 'w-sync' });
  if (r.ran !== true || r.outcome !== 'delivered') throw new Error(`work: ${JSON.stringify(r)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  const master = mockFiles.get(r.videoUrl.split('?')[0]!)!;
  const log = pass(master, ['-vn', '-af', 'silencedetect=n=-30dB:d=0.2']);
  const onset = Number(/silence_end:\s*([\d.]+)/.exec(log)?.[1] ?? Number.NaN);
  // Heard at the flash (1.0 s), within a frame and an AAC frame; before the fix, at 0.7 s.
  expect(Math.abs(onset - 1.0)).toBeLessThanOrEqual(0.06);
});
