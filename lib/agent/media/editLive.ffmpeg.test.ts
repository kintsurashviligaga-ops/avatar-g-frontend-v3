/** @jest-environment node */
/**
 * Agent G's edit on the REAL bundled ffmpeg (and the real caption renderer), offline, on files made here. Pins:
 *   - trim + speed + frame + colour + fade: an H.264/AAC MP4 of the planned frame and length, which passes QC;
 *   - a phone clip (coded landscape, rotated): edited upright, as planned from the shown frame;
 *   - sound-only edits copy the picture (mute drops the sound, volume changes it);
 *   - a caption is burned (bright pixels where the line is, on a black clip);
 *   - a thumbnail is one JPEG of the planned size, with a caption too;
 *   - a cancel kills the running ffmpeg;
 *   - the whole job: quote → queue → worker → QC → stored file, through the lease queue (in memory).
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => null, reSignIfInternal: async (u: string) => u }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { parseProbeBanner, type BannerProbe } from '../../video/probeBanner';
import { probeMedia } from '../../services/montage/beatAnalysis';
import { enqueueEditJob, quoteEdit, type EditExecDeps } from './editExec';
import { renderEdit } from './editLive';
import { qcEdit, resolveEdits, type EditRequest } from './editPlan';
import { workEditJob } from './editWorker';

jest.setTimeout(180_000);
const bin = ffmpegStatic as unknown as string;
let dir = '';

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return out;
}

function banner(path: string): BannerProbe {
  try {
    execFileSync(bin, ['-hide_banner', '-i', path], { stdio: 'pipe' });
  } catch (e) {
    return parseProbeBanner(String((e as { stderr?: Buffer }).stderr ?? ''));
  }
  throw new Error('ffmpeg -i did not fail');
}

/** One frame of a file as 8-bit grey at `w`×`h`. */
function greyFrame(path: string, atSec: number, w: number, h: number): Buffer {
  return execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-ss', String(atSec), '-i', path, '-frames:v', '1', '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-']);
}

let CLIP = '', PHONE = '', SILENT = '', BLACK = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-edit-'));
  // 30 s, 1280×720, a test pattern with a 440 Hz tone.
  CLIP = make('clip.mp4', [
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=30', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=30',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  ]);
  // The same picture, flagged to be shown rotated 90° (how phones store portrait video).
  PHONE = make('phone.mp4', ['-display_rotation', '90', '-i', CLIP, '-c', 'copy']);
  SILENT = make('silent.mp4', ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=25:duration=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']);
  BLACK = make('black.mp4', ['-f', 'lavfi', '-i', 'color=black:size=1280x720:rate=25:duration=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p']);
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function edit(path: string, asks: unknown[]) {
  const src = banner(path);
  const r = resolveEdits(asks, src);
  if (!r.ok) throw new Error(`${r.error}: ${r.message}`);
  const request = { edits: r.edits, plan: r.plan };
  const out = await renderEdit(path, request, { signal: new AbortController().signal });
  if (!out.ok) throw new Error(`${out.error}: ${out.detail}`);
  const file = join(dir, `out-${Math.random().toString(36).slice(2)}.${r.plan.output}`);
  writeFileSync(file, out.bytes);
  return { plan: r.plan, out, file, qc: qcEdit(out.output, r.plan, out.bytes.byteLength) };
}

test('trim + speed + 9:16 + noir + fades: an H.264/AAC MP4 of the planned frame and length', async () => {
  const r = await edit(CLIP, [
    { op: 'trim', fromSec: 5, toSec: 15 }, { op: 'speed', factor: 2 }, { op: 'aspect', to: '9:16' },
    { op: 'grade', style: 'noir' }, { op: 'fade', inSec: 0.5, outSec: 0.5 },
  ]);
  expect(r.plan).toMatchObject({ durationSec: 5, width: 1080, height: 1920, hasAudio: true });
  expect(r.qc).toEqual({ ok: true, problems: [], durationSec: expect.any(Number) });
  expect(r.out.output).toMatchObject({ videoCodec: 'h264', audioCodec: 'aac', width: 1080, height: 1920 });
  expect(Math.abs(r.out.output!.durationSec - 5)).toBeLessThan(0.3);
  expect(r.out.input.durationSec).toBeCloseTo(30, 0);
  // The fade-in starts from black: the first frame is darker than one in the middle.
  const mean = (b: Buffer) => b.reduce((s, v) => s + v, 0) / b.length;
  expect(mean(greyFrame(r.file, 0, 54, 96))).toBeLessThan(mean(greyFrame(r.file, 2.5, 54, 96)) - 20);
});

test('a phone clip (rotated) is edited upright, as planned from the frame it shows', async () => {
  expect(banner(PHONE)).toMatchObject({ width: 1280, height: 720 });
  expect(Math.abs(banner(PHONE).rotation)).toBe(90);
  const r = await edit(PHONE, [{ op: 'trim', toSec: 3 }, { op: 'grade', style: 'cinematic' }]);
  expect(r.plan).toMatchObject({ width: 720, height: 1280 });
  expect(r.qc.ok).toBe(true);
  expect(r.out.output).toMatchObject({ width: 720, height: 1280, rotation: 0 });
});

test('sound-only edits copy the picture: mute drops the sound, volume changes it', async () => {
  const muted = await edit(CLIP, [{ op: 'mute' }]);
  expect(muted.plan.copyVideo).toBe(true);
  expect(muted.qc.ok).toBe(true);
  expect(muted.out.output).toMatchObject({ hasAudio: false, width: 1280, height: 720, videoCodec: 'h264' });
  const louder = await edit(CLIP, [{ op: 'volume', db: 6 }]);
  expect(louder.qc.ok).toBe(true);
  expect(louder.out.output).toMatchObject({ hasAudio: true, audioCodec: 'aac' });
  const meanDb = (path: string): number => {
    const r = spawnSync(bin, ['-hide_banner', '-i', path, '-t', '5', '-af', 'volumedetect', '-vn', '-f', 'null', '-']);
    return Number(/mean_volume: (-?[\d.]+) dB/.exec(String(r.stderr))?.[1]);
  };
  expect(meanDb(louder.file) - meanDb(CLIP)).toBeGreaterThan(4);
});

test('a silent source sped up stays silent', async () => {
  const r = await edit(SILENT, [{ op: 'speed', factor: 2 }]);
  expect(r.plan).toMatchObject({ hasAudio: false, durationSec: 4 });
  expect(r.qc.ok).toBe(true);
  expect(r.out.output!.hasAudio).toBe(false);
});

test('a caption is burned in at the bottom (Georgian included)', async () => {
  const r = await edit(BLACK, [{ op: 'caption', text: 'გამარჯობა MyAvatar' }]);
  expect(r.qc.ok).toBe(true);
  const w = 128, h = 72;
  const frame = greyFrame(r.file, 1, w, h);
  const rows = (from: number, to: number) => { let max = 0; for (let y = from; y < to; y++) for (let x = 0; x < w; x++) max = Math.max(max, frame[y * w + x]!); return max; };
  expect(rows(Math.floor(h * 0.75), h)).toBeGreaterThan(120); // the white line
  expect(rows(0, Math.floor(h * 0.5))).toBeLessThan(30); // the rest stays black
});

test('a thumbnail: one JPEG of the planned frame, and with a caption', async () => {
  const plain = await edit(CLIP, [{ op: 'thumbnail', atSec: 3 }, { op: 'aspect', to: '1:1', fit: 'pad' }]);
  expect(plain.plan).toMatchObject({ output: 'jpg', width: 1080, height: 1080 });
  expect(plain.out.output).toMatchObject({ videoCodec: 'mjpeg', width: 1080, height: 1080 });
  expect(plain.qc.ok).toBe(true);
  expect(plain.out.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
  const captioned = await edit(CLIP, [{ op: 'thumbnail' }, { op: 'caption', text: 'Episode 1' }]);
  expect(captioned.out.output).toMatchObject({ videoCodec: 'mjpeg', width: 1280, height: 720 });
  expect(captioned.qc.ok).toBe(true);
});

test('a cancel kills the running ffmpeg', async () => {
  const src = banner(CLIP);
  const r = resolveEdits([{ op: 'speed', factor: 0.25 }, { op: 'grade', style: 'cinematic' }], src);
  if (!r.ok) throw new Error(r.error);
  const ctl = new AbortController();
  const started = Date.now();
  setTimeout(() => ctl.abort(), 300);
  const out = await renderEdit(CLIP, { edits: r.edits, plan: r.plan }, { signal: ctl.signal });
  expect(out).toEqual({ ok: false, error: 'render_failed', detail: 'cancelled' });
  expect(Date.now() - started).toBeLessThan(10_000);
});

test('the whole job: quote → queue → worker → QC → stored file', async () => {
  const store = memoryLeaseStore(() => Date.now());
  const uploads: Array<{ jobId: string; bytes: number; output: string }> = [];
  let ids = 0;
  const deps: EditExecDeps = {
    resolveFile: async (ref, userId) => (ref === 'omni-uploads/u1/clip.mp4' && userId === 'u1' ? { ok: true, url: CLIP } : { ok: false, reason: 'not_yours' }),
    probe: (url) => probeMedia(url),
    render: (url, request: EditRequest, opts) => renderEdit(url, request, opts),
    upload: async (jobId, bytes, output) => { uploads.push({ jobId, bytes: bytes.byteLength, output }); return `https://store/${jobId}.${output}`; },
    resign: async (u) => u,
    store,
    audit: async () => {},
    key: () => 'k',
    now: () => Date.now(),
    newId: () => `job-${(ids += 1)}`,
    every: () => () => {},
  };
  const q = await quoteEdit(deps, { userId: 'u1', file: 'omni-uploads/u1/clip.mp4', edits: [{ op: 'trim', lastSec: 4 }, { op: 'aspect', to: '4:5' }] });
  if (!q.ok) throw new Error(q.error);
  expect(q.quote.plan).toMatchObject({ durationSec: 4, width: 1080, height: 1350 });
  const run = await enqueueEditJob(deps, { userId: 'u1', request: q.request, token: q.token });
  expect(run).toMatchObject({ ok: true, status: 'queued' });
  expect(await workEditJob(deps, { jobId: q.quote.jobId, worker: 'w1' })).toEqual({ ran: true, outcome: 'delivered', url: 'https://store/job-1.mp4' });
  expect(store.rows.get('job-1')).toMatchObject({ status: 'completed', result: { width: 1080, height: 1350, output: 'mp4' } });
  expect(uploads[0]!.bytes).toBeGreaterThan(10_000);
});
