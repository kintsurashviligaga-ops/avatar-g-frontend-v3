/** @jest-environment node */
/**
 * GG 2026-10-11 17:38Z: „ქაფქათს და სხვა ფუნქციებს რაც აკლია ისიც ჩასამატებელია". CapCut's effects in Agent G's edit,
 * on the REAL bundled ffmpeg, from the owner's own words to the delivered file, each measured on that file:
 *   F1  light and colour („უფრო ნათელი, თბილი ტონით და ვინიეტით"): brighter, warmer, darker at the corners
 *   F2  a mirror: the left of the picture is on the right
 *   F3  a quarter turn to the right: a tall frame, the left edge on top
 *   F4  a slow zoom in: the middle 15 % larger by the end, the length kept
 *   F5  a camera shake: the picture moves from frame to frame, the frame kept
 *   F6  a glitch: bursts of broken picture every 1.6 s, the picture clean between them
 *   F7  steadying a shaky clip: the jitter at least 40 % less
 *   F8  9:16 over a blurred copy: nothing cut, the bands a soft copy of the picture, not black
 *   F9  background noise out of the sound: the hiss 9 dB lower or more, the tone kept
 *   F10 the sound evened out: -14 LUFS from a quiet clip
 *   F11 a photo turned and brightened: a tall JPEG, brighter
 *   F12 several at once, in English: 9:16 over its own blur, warmer, a slow zoom
 * Each runs quote → queue → worker → QC → stored file through the lease queue (in memory), like a user's job.
 * EFFECTS_DIR=<dir> keeps frames and evidence.json there.
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => null, reSignIfInternal: async (u: string) => u }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { probeMedia } from '../../services/montage/beatAnalysis';
import { enqueueEditJob, quoteEdit, type EditExecDeps } from './editExec';
import { renderEdit } from './editLive';
import type { EditRequest, MediaEdit } from './editPlan';
import { mineEdits } from './editWords';
import { workEditJob } from './editWorker';

jest.setTimeout(300_000);
const bin = ffmpegStatic as unknown as string;
const KEEP = process.env.EFFECTS_DIR;
let dir = '';
const evidence: Record<string, unknown> = {};

const W = 1280, H = 720, SEC = 6;
/** A smooth backdrop, a red marker on the left and a white square in the middle. */
const BACKDROP = `color=black:s=${W}x${H},format=rgb24,geq=r='60+70*X/W':g='70+60*Y/H':b='90+50*X/W'`;
const MARKERS = 'drawbox=x=120:y=300:w=120:h=120:c=0xe02020:t=fill,drawbox=x=580:y=300:w=120:h=120:c=white:t=fill';
const RED_AT = { x: 180, y: 360 };
const ENC = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p'];

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return out;
}

/** One frame as RGB at its own size. */
function rgb(path: string, atSec: number, w: number, h: number): Buffer {
  return execFileSync(bin, ['-hide_banner', '-loglevel', 'error', ...(atSec > 0 ? ['-ss', String(atSec)] : []), '-i', path, '-frames:v', '1', '-vf', `scale=${w}:${h},format=rgb24`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 27 });
}
/** Every frame as grey, for tracking. */
function greyFrames(path: string, w: number, h: number): Buffer[] {
  const buf = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-i', path, '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const n = Math.floor(buf.length / (w * h));
  return Array.from({ length: n }, (_, k) => buf.subarray(k * w * h, (k + 1) * w * h));
}

type Box = { x: number; y: number; w: number; h: number };
/** Mean R, G, B and luma inside a box. */
function mean(f: Buffer, w: number, b: Box): { r: number; g: number; b: number; y: number } {
  let r = 0, g = 0, bl = 0, n = 0;
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) {
      const i = (y * w + x) * 3;
      r += f[i]!; g += f[i + 1]!; bl += f[i + 2]!; n += 1;
    }
  }
  r /= n; g /= n; bl /= n;
  return { r: r1(r), g: r1(g), b: r1(bl), y: r1(0.299 * r + 0.587 * g + 0.114 * bl) };
}
/** Mean absolute difference of two RGB frames of one size. */
function mad(a: Buffer, b: Buffer): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return r1(s / a.length);
}
/** Mean absolute difference between neighbouring pixels in a box (detail: a blur has little). */
function detail(f: Buffer, w: number, b: Box): number {
  let s = 0, n = 0;
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w - 1; x++) {
      const i = (y * w + x) * 3;
      s += Math.abs(f[i]! - f[i + 3]!) + Math.abs(f[i + 1]! - f[i + 4]!) + Math.abs(f[i + 2]! - f[i + 5]!);
      n += 3;
    }
  }
  return r1(s / n);
}
/** The centre of the strongly red pixels. */
function redAt(f: Buffer, w: number, h: number): { x: number; y: number } | null {
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (f[i]! > 170 && f[i + 1]! < 90 && f[i + 2]! < 90) { sx += x; sy += y; n += 1; }
    }
  }
  return n > 50 ? { x: Math.round(sx / n), y: Math.round(sy / n) } : null;
}
/** The width of the white square's run through the middle row (by its lightness: a warmer white is still the square). */
function whiteWidth(f: Buffer, w: number, h: number): number {
  const y = Math.round(h / 2);
  let n = 0;
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    if (0.299 * f[i]! + 0.587 * f[i + 1]! + 0.114 * f[i + 2]! > 215) n += 1;
  }
  return n;
}
/** The centre of the bright pixels in a window of a grey frame. */
function brightAt(f: Buffer, w: number, win: Box): { x: number; y: number } | null {
  let sx = 0, sy = 0, n = 0;
  for (let y = win.y; y < win.y + win.h; y++) {
    for (let x = win.x; x < win.x + win.w; x++) if (f[y * w + x]! > 245) { sx += x; sy += y; n += 1; }
  }
  return n > 50 ? { x: sx / n, y: sy / n } : null;
}
const sd = (a: number[]) => {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return r1(Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length));
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** The mean level of a stretch of the sound, in dBFS. */
function level(path: string, fromSec: number, sec: number): number {
  const r = spawnSync(bin, ['-hide_banner', '-ss', String(fromSec), '-t', String(sec), '-i', path, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr);
  if (!m) throw new Error('no level');
  return Number(m[1]);
}
/** The integrated loudness, in LUFS. */
function lufs(path: string): number {
  const r = spawnSync(bin, ['-hide_banner', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /Integrated loudness:\s*\n\s*I:\s*(-?[\d.]+) LUFS/.exec(r.stderr);
  if (!m) throw new Error('no loudness');
  return Number(m[1]);
}

function snapshot(name: string, path: string, atSec: number): void {
  if (!KEEP) return;
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...(atSec > 0 ? ['-ss', String(atSec)] : []), '-i', path, '-frames:v', '1', '-update', '1', join(KEEP, name)]);
}

/** The owner's words → the edit quote → the queue → the worker on the real ffmpeg → the stored file. */
async function job(source: string, words: string, output: 'mp4' | 'jpg'): Promise<{ file: string; edits: MediaEdit[]; plan: EditRequest['plan']; ms: number }> {
  const store = memoryLeaseStore(() => Date.now());
  const stored: Buffer[] = [];
  let ids = 0;
  const ref = `omni-uploads/u1/${source.split('/').pop()}`;
  const deps: EditExecDeps = {
    resolveFile: async (r, userId) => (r === ref && userId === 'u1' ? { ok: true, url: source } : { ok: false, reason: 'not_yours' }),
    probe: (url) => probeMedia(url),
    render: (url, request: EditRequest, opts) => renderEdit(url, request, opts),
    upload: async (_jobId, bytes) => { stored.push(bytes); return `https://store/${ids}.${output}`; },
    resign: async (u) => u,
    store,
    audit: async () => {},
    key: () => 'k',
    now: () => Date.now(),
    newId: () => `job-${(ids += 1)}`,
    every: () => () => {},
  };
  const mined = mineEdits(words);
  const q = await quoteEdit(deps, { userId: 'u1', file: ref, edits: mined.edits });
  if (!q.ok) throw new Error(`${q.error}: ${q.message}`);
  const run = await enqueueEditJob(deps, { userId: 'u1', request: q.request, token: q.token });
  expect(run).toMatchObject({ ok: true, status: 'queued' });
  const t0 = Date.now();
  const worked = await workEditJob(deps, { jobId: q.quote.jobId, worker: 'w1' });
  expect(worked).toMatchObject({ ran: true, outcome: 'delivered' });
  const file = join(dir, `result-${source.split('/').pop()!.replace(/\.\w+$/, '')}-${Object.keys(evidence).length}.${output}`);
  writeFileSync(file, stored[0]!);
  return { file, edits: q.quote.edits, plan: q.quote.plan, ms: Date.now() - t0 };
}

let SRC = '', SHAKY = '', NOISY = '', QUIET = '', PHOTO = '', STRIPES = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-effects-'));
  if (KEEP) mkdirSync(KEEP, { recursive: true });
  const bg = make('bg.png', ['-f', 'lavfi', '-i', `${BACKDROP},${MARKERS}`, '-frames:v', '1', '-update', '1']);
  SRC = make('src.mp4', ['-loop', '1', '-framerate', '25', '-t', String(SEC), '-i', bg, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${SEC}`, ...ENC, '-c:a', 'aac', '-shortest']);
  // A textured wall with a white square, filmed by a hand that will not keep still (±12 px, ±9 px).
  const tex = make('tex.png', ['-f', 'lavfi', '-i', "color=black:s=1360x800,format=gray,geq=lum='96+60*sin(X/7)*sin(Y/9)+40*random(1)'", '-frames:v', '1', '-update', '1']);
  SHAKY = make('shaky.mp4', ['-loop', '1', '-framerate', '25', '-t', '4', '-i', tex, '-vf',
    "drawbox=x=640:y=360:w=80:h=80:c=white:t=fill,crop=1280:720:x='40+12*sin(2*PI*t*2)':y='40+9*sin(2*PI*t*1.7)',format=yuv420p", ...ENC]);
  // A tone for the first 3 s, a steady hiss under the whole clip (-35 dBFS).
  NOISY = make('noisy.mp4', ['-f', 'lavfi', '-i', `color=gray:s=640x360:d=${SEC}`, '-f', 'lavfi', '-i', `sine=f=440:d=3,apad=whole_dur=${SEC}`,
    '-f', 'lavfi', '-i', `anoisesrc=d=${SEC}:c=white:a=0.03`, '-filter_complex', '[1:a][2:a]amix=inputs=2:normalize=0[a]', '-map', '0:v', '-map', '[a]',
    ...ENC, '-c:a', 'aac', '-b:a', '192k', '-shortest']);
  // A quiet clip (-30 dB tone).
  QUIET = make('quiet.mp4', ['-f', 'lavfi', '-i', `color=gray:s=640x360:d=${SEC}`, '-f', 'lavfi', '-i', `sine=f=440:d=${SEC},volume=-30dB`, ...ENC, '-c:a', 'aac', '-shortest']);
  // Fine stripes everywhere (detail a blur takes away), a red marker at each side edge (what a crop would cut).
  const stripes = make('stripes.png', ['-f', 'lavfi', '-i', "color=black:s=1280x720,format=rgb24,geq=r='128+90*gt(sin(X/3),0)':g='110+90*gt(sin(X/3),0)':b='100+90*gt(sin(X/3),0)'",
    '-vf', 'drawbox=x=10:y=300:w=70:h=120:c=0xe02020:t=fill,drawbox=x=1200:y=300:w=70:h=120:c=0xe02020:t=fill', '-frames:v', '1', '-update', '1']);
  STRIPES = make('stripes.mp4', ['-loop', '1', '-framerate', '25', '-t', '3', '-i', stripes, ...ENC]);
  PHOTO = make('photo.jpg', ['-f', 'lavfi', '-i', `color=black:s=1200x800,format=rgb24,geq=r='60+70*X/W':g='70+60*Y/H':b='90+50*X/W',drawbox=x=100:y=340:w=120:h=120:c=0xe02020:t=fill`, '-frames:v', '1', '-q:v', '2', '-update', '1']);
});

afterAll(() => {
  if (KEEP) writeFileSync(join(KEEP, 'evidence.json'), JSON.stringify(evidence, null, 2));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

/** Near the middle, beside the white square: where a vignette leaves the picture as it is. */
const PLAIN: Box = { x: 420, y: 300, w: 140, h: 120 };
const CORNER: Box = { x: 0, y: 0, w: 120, h: 120 };

test('F1 light and colour from the owner\'s words: brighter, warmer, darker at the corners', async () => {
  const r = await job(SRC, 'გააკეთე უფრო ნათელი, თბილი ტონით და ვინიეტით', 'mp4');
  expect(r.edits).toEqual([{ op: 'adjust', brightness: 25, warmth: 40, vignette: 50 }]);
  expect(r.plan).toMatchObject({ output: 'mp4', durationSec: SEC, width: W, height: H, hasAudio: true });
  const src = rgb(SRC, 2, W, H), out = rgb(r.file, 2, W, H);
  const s = mean(src, W, PLAIN), o = mean(out, W, PLAIN), sc = mean(src, W, CORNER), oc = mean(out, W, CORNER);
  expect(o.y - s.y).toBeGreaterThan(8); // brighter
  expect((o.r - o.b) - (s.r - s.b)).toBeGreaterThan(10); // warmer: more red than blue than before
  expect(oc.y - sc.y).toBeLessThan(o.y - s.y - 8); // the corners gain less: the vignette
  snapshot('f1-before.png', SRC, 2); snapshot('f1-after.png', r.file, 2);
  evidence.f1 = { edits: r.edits, plain: { before: s, after: o }, corner: { before: sc, after: oc }, ms: r.ms };
});

test('F2 a mirror: the red marker on the left is on the right', async () => {
  const r = await job(SRC, 'სარკისებურად ამოაბრუნე', 'mp4');
  expect(r.edits).toEqual([{ op: 'flip', axis: 'horizontal' }]);
  const at = redAt(rgb(r.file, 2, W, H), W, H)!;
  expect(Math.abs(at.x - (W - 1 - RED_AT.x))).toBeLessThanOrEqual(4);
  expect(Math.abs(at.y - RED_AT.y)).toBeLessThanOrEqual(4);
  snapshot('f2-mirror.png', r.file, 2);
  evidence.f2 = { edits: r.edits, red: { before: redAt(rgb(SRC, 2, W, H), W, H), after: at }, ms: r.ms };
});

test('F3 a quarter turn to the right: a tall frame, the left edge on top', async () => {
  const r = await job(SRC, 'მოატრიალე 90 გრადუსით მარჯვნივ', 'mp4');
  expect(r.edits).toEqual([{ op: 'rotate', deg: 90 }]);
  expect(r.plan).toMatchObject({ width: H, height: W });
  const probe = await probeMedia(r.file);
  expect(probe).toMatchObject({ width: H, height: W });
  const at = redAt(rgb(r.file, 2, H, W), H, W)!;
  // Clockwise: (x, y) → (H-1-y, x).
  expect(Math.abs(at.x - (H - 1 - RED_AT.y))).toBeLessThanOrEqual(4);
  expect(Math.abs(at.y - RED_AT.x)).toBeLessThanOrEqual(4);
  snapshot('f3-turned.png', r.file, 2);
  evidence.f3 = { edits: r.edits, frame: [probe!.width, probe!.height], red: at, ms: r.ms };
});

test('F4 a slow zoom in: the middle 15 % larger by the end, the length kept', async () => {
  const r = await job(SRC, 'ზუმი გაუკეთე', 'mp4');
  expect(r.edits).toEqual([{ op: 'motion', zoom: 'in' }]);
  const probe = await probeMedia(r.file);
  expect(Math.abs(probe!.durationSec - SEC)).toBeLessThanOrEqual(0.1);
  expect(probe).toMatchObject({ width: W, height: H, hasAudio: true });
  const first = whiteWidth(rgb(r.file, 0.05, W, H), W, H), last = whiteWidth(rgb(r.file, SEC - 0.1, W, H), W, H);
  expect(first).toBeGreaterThanOrEqual(116);
  expect(first).toBeLessThanOrEqual(126);
  expect(last / first).toBeGreaterThan(1.11);
  expect(last / first).toBeLessThan(1.19);
  snapshot('f4-zoom-start.png', r.file, 0.05); snapshot('f4-zoom-end.png', r.file, SEC - 0.1);
  evidence.f4 = { edits: r.edits, whiteSquarePx: { first, last, ratio: Number((last / first).toFixed(3)) }, durationSec: probe!.durationSec, ms: r.ms };
});

test('F5 a camera shake: the picture moves from frame to frame, the frame kept', async () => {
  const r = await job(SRC, 'add a camera shake effect', 'mp4');
  expect(r.edits).toEqual([{ op: 'motion', shake: true }]);
  expect(await probeMedia(r.file)).toMatchObject({ width: W, height: H });
  const win: Box = { x: 400, y: 150, w: 480, h: 420 };
  const xs = greyFrames(r.file, W, H).map((f) => brightAt(f, W, win)).filter((p): p is { x: number; y: number } => p !== null);
  expect(xs.length).toBeGreaterThan(100);
  const sdx = sd(xs.map((p) => p.x)), sdy = sd(xs.map((p) => p.y));
  expect(sdx).toBeGreaterThan(10);
  expect(sdy).toBeGreaterThan(10);
  evidence.f5 = { edits: r.edits, squareJitterPx: { sdx, sdy }, frames: xs.length, ms: r.ms };
});

test('F6 a glitch: bursts of broken picture every 1.6 s, the picture clean between them', async () => {
  const r = await job(SRC, 'добавь глитч', 'mp4');
  expect(r.edits).toEqual([{ op: 'motion', glitch: true }]);
  const calm = mad(rgb(r.file, 1.0, W, H), rgb(SRC, 1.0, W, H)), burst = mad(rgb(r.file, 1.68, W, H), rgb(SRC, 1.68, W, H));
  const burst2 = mad(rgb(r.file, 3.28, W, H), rgb(SRC, 3.28, W, H));
  expect(calm).toBeLessThan(3);
  expect(burst).toBeGreaterThan(8);
  expect(burst2).toBeGreaterThan(8);
  snapshot('f6-glitch-burst.png', r.file, 1.68);
  evidence.f6 = { edits: r.edits, madVsSource: { calmAt1s: calm, burstAt1_68s: burst, burstAt3_28s: burst2 }, ms: r.ms };
});

test('F7 steadying a shaky clip: the jitter at least 40 % less', async () => {
  const r = await job(SHAKY, 'стабилизируй видео', 'mp4');
  expect(r.edits).toEqual([{ op: 'stabilize' }]);
  const win: Box = { x: 540, y: 260, w: 280, h: 260 };
  const track = (p: string) => greyFrames(p, W, H).map((f) => brightAt(f, W, win)).filter((q): q is { x: number; y: number } => q !== null);
  const before = track(SHAKY), after = track(r.file);
  const jb = Math.hypot(sd(before.map((p) => p.x)), sd(before.map((p) => p.y)));
  const ja = Math.hypot(sd(after.map((p) => p.x)), sd(after.map((p) => p.y)));
  expect(after.length).toBeGreaterThan(90);
  expect(ja).toBeLessThan(jb * 0.6);
  evidence.f7 = { edits: r.edits, jitterPx: { before: r1(jb), after: r1(ja), less: `${Math.round((1 - ja / jb) * 100)} %` }, ms: r.ms };
});

test('F8 9:16 over a blurred copy: nothing cut, the bands a soft copy of the picture, not black', async () => {
  const r = await job(STRIPES, '9:16 ბუნდოვანი ფონით', 'mp4');
  expect(r.edits).toEqual([{ op: 'aspect', to: '9:16', fit: 'blur' }]);
  expect(r.plan).toMatchObject({ width: 1080, height: 1920 });
  const out = rgb(r.file, 1, 1080, 1920);
  const band: Box = { x: 0, y: 40, w: 1080, h: 520 };
  const top = mean(out, 1080, band);
  // The picture itself, whole, in the middle (1280×720 → 1080×608 at y = 656).
  const mid = Buffer.alloc(1080 * 608 * 3);
  out.copy(mid, 0, 656 * 1080 * 3, (656 + 608) * 1080 * 3);
  const sharp = detail(mid, 1080, { x: 100, y: 0, w: 880, h: 200 }), soft = detail(out, 1080, band);
  expect(top.y).toBeGreaterThan(80); // not bars: the stripes' own colours, averaged
  expect(soft).toBeLessThan(sharp * 0.1); // the stripes blurred away in the bands, kept in the picture
  // Nothing cut: both side markers are in the picture, at its edges.
  const left = redAt(Buffer.concat([...Array(608)].map((_, y) => mid.subarray(y * 1080 * 3, (y * 1080 + 540) * 3))), 540, 608);
  const right = redAt(Buffer.concat([...Array(608)].map((_, y) => mid.subarray((y * 1080 + 540) * 3, (y + 1) * 1080 * 3))), 540, 608);
  expect(left!.x).toBeLessThan(60);
  expect(right!.x + 540).toBeGreaterThan(1020);
  snapshot('f8-blur-fit.png', r.file, 1);
  evidence.f8 = { edits: r.edits, frame: [1080, 1920], band: { mean: top, detail: soft }, pictureDetail: sharp, sideMarkers: { left, right: { x: right!.x + 540, y: right!.y } }, ms: r.ms };
});

test('F9 background noise out of the sound: the hiss 9 dB lower or more, the tone kept, the picture copied', async () => {
  const r = await job(NOISY, 'ფონური ხმაური მოაშორე', 'mp4');
  expect(r.edits).toEqual([{ op: 'denoise' }]);
  expect(r.plan.copyVideo).toBe(true);
  const hiss = { before: level(NOISY, 3.5, 2), after: level(r.file, 3.5, 2) };
  const tone = { before: level(NOISY, 0.5, 2), after: level(r.file, 0.5, 2) };
  expect(hiss.before - hiss.after).toBeGreaterThanOrEqual(9);
  expect(Math.abs(tone.before - tone.after)).toBeLessThanOrEqual(1.5);
  evidence.f9 = { edits: r.edits, dBFS: { hiss, tone }, ms: r.ms };
});

test('F10 the sound evened out: -14 LUFS from a quiet clip', async () => {
  const r = await job(QUIET, 'ხმა გაათანაბრე', 'mp4');
  expect(r.edits).toEqual([{ op: 'loudness' }]);
  const before = lufs(QUIET), after = lufs(r.file);
  expect(before).toBeLessThan(-40);
  expect(Math.abs(after - -14)).toBeLessThanOrEqual(1.5);
  evidence.f10 = { edits: r.edits, lufs: { before, after }, ms: r.ms };
});

test('F11 a photo turned and brightened: a tall JPEG, brighter', async () => {
  const r = await job(PHOTO, 'ამ სურათს 90 გრადუსით მოატრიალე და გაანათე', 'jpg');
  expect(r.edits).toEqual([{ op: 'rotate', deg: 90 }, { op: 'adjust', brightness: 25 }]);
  expect(r.plan).toMatchObject({ output: 'jpg', width: 800, height: 1200 });
  const probe = await probeMedia(r.file);
  expect(probe).toMatchObject({ width: 800, height: 1200 });
  const before = mean(rgb(PHOTO, 0, 1200, 800), 1200, { x: 700, y: 100, w: 200, h: 200 });
  // The same place of the picture after a clockwise turn: (x, y) → (799 - y, x).
  const after = mean(rgb(r.file, 0, 800, 1200), 800, { x: 500, y: 700, w: 200, h: 200 });
  expect(after.y - before.y).toBeGreaterThan(8);
  snapshot('f11-photo.png', r.file, 0);
  evidence.f11 = { edits: r.edits, frame: [800, 1200], luma: { before: before.y, after: after.y }, ms: r.ms };
});

test('F12 several at once, in English: 9:16 over its own blur, warmer, a slow zoom', async () => {
  const r = await job(SRC, 'make it 9:16 with a blurred background, warmer, with a slow zoom in', 'mp4');
  expect(r.edits.map((e) => e.op)).toEqual(['aspect', 'motion', 'adjust']);
  expect(r.plan).toMatchObject({ width: 1080, height: 1920, durationSec: SEC });
  const probe = await probeMedia(r.file);
  expect(probe).toMatchObject({ width: 1080, height: 1920 });
  const first = rgb(r.file, 0.05, 1080, 1920), last = rgb(r.file, SEC - 0.1, 1080, 1920);
  const band = mean(first, 1080, { x: 0, y: 40, w: 1080, h: 400 });
  expect(band.y).toBeGreaterThan(40);
  // The band is the middle of the picture blown up (source x 437–843 of 1280), where r − b is −23 to −17: warmer, it is
  // redder than any of it.
  expect(band.r - band.b).toBeGreaterThan(-12);
  expect(whiteWidth(last, 1080, 1920) / whiteWidth(first, 1080, 1920)).toBeGreaterThan(1.1);
  snapshot('f12-combo-start.png', r.file, 0.05); snapshot('f12-combo-end.png', r.file, SEC - 0.1);
  evidence.f12 = { edits: r.edits, frame: [1080, 1920], band, white: { first: whiteWidth(first, 1080, 1920), last: whiteWidth(last, 1080, 1920) }, ms: r.ms };
});
