/** @jest-environment node */
/**
 * The owner's montage of 2026-10-11, the whole way, on the REAL bundled ffmpeg and resvg, offline (network, storage and
 * database faked as in ./mediaStudio.ffmpeg.test.ts and ./composition.ffmpeg.test.ts):
 *
 *   „დაამონტაჟე, სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე რომ ეფექტი გამოვიდეს და მუსიკა დაადე 0.59
 *    წამიდან რომ დაიწყოს, ასევე დაადე ოვერლეი, გაუკეთე ქებშენი და ლამაზად დააწერე მოუშენით myavatar.ge🚀 და ბოლოს
 *    ქართულად უნდა დაიწეროს გადმოდი საიტზე" + five clips + one song.
 *
 * The chat reads it into ONE plan (lib/agent/run/runChat): a montage step (music from 0:59, speed by the music) and an
 * edit step after it (the overlay, the moving text, the end text). Each step goes quote → queue → worker → QC → stored
 * file, and the delivered files are then measured by this test's own frame reads:
 *   - the montage: the track heard from its 0:59 at the first frame; the shots the music calls calm play at 0.5×, the
 *     strong ones at 1.5×, measured from the pictures (each clip's brightness counts its own seconds), not the plan;
 *   - the edit: the overlay is over the whole picture; „myavatar.ge🚀" is drawn (the rocket in its own colours) until
 *     3 s before the end, „გადმოდი საიტზე" in the last 3 s; the length is the montage's to the frame.
 *
 * OWNER_MONTAGE_DIR=<dir> keeps the contact sheets (PNG) and the measured numbers (evidence.json).
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
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));

import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { analyzeTrack, grabFrames, probeMedia, streamDurations } from '../../services/montage/beatAnalysis';
import { runMontage } from '../../services/montage/montagePipeline';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { withFfmpegSignal } from '../../video/ffmpegExec';
import { chainSpec, runChainAsk } from '../run/runChat';
import { editViewOf, enqueueEditJob, quoteEdit, type EditExecDeps, type EditJobView } from './editExec';
import { renderEdit } from './editLive';
import { validateEditRequest, type EditRequest } from './editPlan';
import { workEditJob } from './editWorker';
import { missingGlyphs } from './layerRender';
import type { LayerQcRecord } from './layerQc';
import type { Rect, TextLayer } from './layers';
import { enqueueMontageJob, quoteMontage, type MontageExecDeps } from './montageExec';
import type { AudioTiming, SourceContribution } from './montageAsk';
import { workMontageJob } from './montageWorker';

jest.setTimeout(900_000);
const bin = ffmpegStatic as unknown as string;
const OUT = process.env.OWNER_MONTAGE_DIR ?? '';
let dir = '';
const evidence: Record<string, unknown> = {};

const GG = 'დაამონტაჟე, სადაც საჭიროა ააჩქარე კადრი და სადაც საჭიროა შეანელე რომ ეფექტი გამოვიდეს და მუსიკა დაადე 0.59 წამიდან რომ დაიწყოს, ასევე დაადე ოვერლეი, გაუკეთე ქებშენი და ლამაზად დააწერე მოუშენით myavatar.ge🚀 და ბოლოს ქართულად უნდა დაიწეროს გადმოდი საიტზე';

/** Each clip's brightness counts its own seconds: luma 16 + 18 per second (12 s → 232), so a frame says its source time. */
const LUMA_PER_SEC = 18;
const CLIP_SEC = 12;

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  mockFiles.set(`https://media.test/in/${name}`, out);
  return `https://media.test/in/${name}`;
}
const local = (url: string) => mockFiles.get(url.split('?')[0]!)!;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'owner-montage-'));
  mockOut = dir;
  if (OUT) mkdirSync(OUT, { recursive: true });
});
afterAll(() => {
  if (OUT) writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 1));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// ── the app's two executors, as the run's step adapters call them ───────────────────────────────────────────────────

const store = memoryLeaseStore(() => Date.now());
let ids = 0;
const montageDeps: MontageExecDeps = {
  resolveFile: async (ref) => ({ ok: true, url: ref }),
  probe: (url) => probeMedia(url),
  analyzeTrack: (url) => analyzeTrack(url),
  render: (req, o) => runMontage(req, { jobId: o.jobId, signal: o.signal, onStage: o.onStage }),
  grabFrames: (url, timesSec, o) => withFfmpegSignal(o.signal, () => grabFrames(url, timesSec, { size: o.size, ...(o.fit ? { fit: o.fit } : {}) })),
  streamDurations: (url, o) => withFfmpegSignal(o?.signal, () => streamDurations(url)),
  store,
  billing: { reserve: async () => ({ proceed: true, charged: false, reason: 'ok' }), refund: async () => 'nothing' },
  audit: async () => {},
  key: () => 'test-key',
  now: () => Date.now(),
  newId: () => `montage-job-${ids++}`,
  every: () => () => {},
};
const editDeps: EditExecDeps = {
  resolveFile: async (ref, userId) => {
    const file = mockFiles.get(ref.split('?')[0]!);
    return userId === 'u1' && file ? { ok: true, url: file } : { ok: false, reason: 'not_yours' };
  },
  probe: (url) => probeMedia(url),
  render: (url, request, opts) => renderEdit(url, request, opts),
  upload: async (jobId, bytes, output, variant) => {
    const path = `renders/edits/${jobId}${variant === 'clean' ? '-clean' : ''}.${output}`;
    const file = join(dir, path.replace(/\//g, '_'));
    writeFileSync(file, bytes);
    mockFiles.set(`https://media.test/${path}`, file);
    return `https://media.test/${path}?token=t`;
  },
  missingGlyphs: (texts) => missingGlyphs(texts.join(' ')),
  resign: async (u) => u,
  store,
  audit: async () => {},
  key: () => 'k',
  now: () => Date.now(),
  newId: () => randomUUID(),
  every: () => () => {},
};

interface Edited { url: string; file: string; request: EditRequest; result: Record<string, unknown> }
async function edit(file: string, edits: unknown[]): Promise<Edited> {
  const q = await quoteEdit(editDeps, { userId: 'u1', file, edits });
  if (!q.ok) throw new Error(`edit refused: ${q.error} ${q.message} ${q.detail ?? ''}`);
  const e = await enqueueEditJob(editDeps, { userId: 'u1', request: q.request, token: q.token });
  if (!e.ok) throw new Error(`edit not queued: ${e.error}`);
  const w = await workEditJob(editDeps, { jobId: q.quote.jobId, worker: 'w-edit' });
  const row = (await store.read(q.quote.jobId))!;
  if (!w.ran || w.outcome !== 'delivered') throw new Error(`edit not delivered: ${JSON.stringify(w)} ${row.error ?? ''}`);
  const view = editViewOf(row) as Extract<EditJobView, { status: 'completed' }>;
  return { url: view.url, file: local(view.url), request: validateEditRequest((row.params._job as { request: unknown }).request)!, result: row.result as Record<string, unknown> };
}

// ── this test's own eyes ────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Every frame's luma (Y) inside the centre quarter, in order, read as the file stores it (yuv420p, no conversion: a
 * gray readout would rescale by each file's own range tag). The clips are flat, so this is the clip's brightness.
 */
function lumas(path: string): number[] {
  const raw = execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-i', path, '-map', '0:v:0', '-vf', 'crop=iw/4:ih/4,scale=2:2:flags=area', '-f', 'rawvideo', '-pix_fmt', 'yuv420p', '-'], { maxBuffer: 1 << 26 });
  const out: number[] = [];
  for (let i = 0; i + 5 < raw.length; i += 6) out.push((raw[i]! + raw[i + 1]! + raw[i + 2]! + raw[i + 3]!) / 4); // 4 Y, then U, V
  return out;
}

/** One frame as RGB at its own size. */
function rgb(file: string, t: number, w: number, h: number): Buffer {
  return execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-ss', t.toFixed(3), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 27 }).subarray(0, w * h * 3);
}

/** Mean absolute difference of two frames inside a box (0–255). */
function diffIn(a: Buffer, b: Buffer, fw: number, r: Rect): number {
  let sum = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      const i = (y * fw + x) * 3;
      sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
      n += 3;
    }
  }
  return Math.round((sum / n) * 100) / 100;
}

const count = (f: Buffer, fw: number, r: Rect, test: (r: number, g: number, b: number) => boolean): number => {
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) { const i = (y * fw + x) * 3; if (test(f[i]!, f[i + 1]!, f[i + 2]!)) n += 1; }
  return n;
};

/** Mean loudness (dBFS) of a file's sound from `fromSec` for `forSec`. */
function meanDb(path: string, fromSec: number, forSec: number): number {
  const r = spawnSync(bin, ['-hide_banner', '-i', path, '-map', '0:a:0', '-af', `atrim=start=${fromSec}:duration=${forSec},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  if (!m) throw new Error(`volumedetect: ${r.stderr.slice(-400)}`);
  return m[1] === '-inf' ? -Infinity : Number(m[1]);
}

/** A contact sheet: the frames side by side at one height (kept only with OWNER_MONTAGE_DIR). */
function sheet(name: string, frames: Array<{ file: string; t: number }>): void {
  if (!OUT) return;
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const f of frames) args.push('-ss', f.t.toFixed(3), '-i', f.file);
  const scaled = frames.map((_, i) => `[${i}:v]scale=-2:640,setsar=1,format=rgb24[s${i}]`).join(';');
  const graph = `${scaled};${frames.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${frames.length}[o]`;
  execFileSync(bin, [...args, '-filter_complex', graph, '-map', '[o]', '-frames:v', '1', join(OUT, `${name}.png`)]);
}

/** Least-squares slope of y over x. */
function slope(xs: number[], ys: number[]): number {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i]! - mx) * (ys[i]! - my); sxx += (xs[i]! - mx) ** 2; }
  return sxy / sxx;
}

// ── the case ────────────────────────────────────────────────────────────────────────────────────────────────────────

test('the owner’s sentence: one plan, music from 0:59, slow and fast shots by the music, the overlay, the moving text and the end text', async () => {
  // Five portrait phone clips (9:16), each 12 s; the brightness of each clip's centre counts its own seconds; a 2:00 song: silence, a 1 kHz
  // marker at exactly 0:59.0–0:59.4, then 120 BPM kicks, quiet until 1:14 and loud after it.
  // A grey moving test pattern (a picture for the overlay's QC to keep) with a plain box in the middle whose luma is
  // the clock; no colour anywhere, so the rocket's red and blue can only be the text's.
  const clips = [0, 1, 2, 3, 4].map((i) => make(`clip${i}.mp4`, [
    '-f', 'lavfi', '-i', `testsrc2=size=360x640:rate=30:duration=${CLIP_SEC}`,
    '-f', 'lavfi', '-i', `color=c=gray:size=180x320:rate=30:duration=${CLIP_SEC}`,
    '-filter_complex', `[0:v]hue=s=0[bg];[1:v]geq=lum='16+${LUMA_PER_SEC}*T':cb=128:cr=128[clock];[bg][clock]overlay=90:160:shortest=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709',
  ]));
  const kicks = 'sin(2*PI*55*t)*exp(-30*mod(t-59.5+10,0.5))*gte(t,59.5)';
  const song = make('song.m4a', ['-f', 'lavfi', '-i', `aevalsrc='0.9*sin(2*PI*1000*t)*between(t,59,59.4)+(0.08+0.82*gte(t,74))*${kicks}':s=44100:d=120`, '-c:a', 'aac']);
  const paths = [...clips, song];

  // ── the chat: one plan of two steps, every part of the ask in it ──
  const chain = runChainAsk(GG, ['video', 'video', 'video', 'video', 'video', 'audio']);
  expect(chain).toMatchObject({ kind: 'cut-edit', montage: { musicStartSec: 59, ramp: 'mixed' } });
  if (!chain || chain.kind !== 'cut-edit') throw new Error('no chain');
  expect(chain.edits.map((e) => e.op)).toEqual(['overlay', 'layers']);
  expect(chain.unplanned ?? []).toEqual([]);
  const spec = chainSpec(chain, GG, paths);
  const cut = spec.steps[0]!;
  if (cut.tool !== 'montage') throw new Error('first step is not the montage');

  // ── step 1: the montage ──
  const q = await quoteMontage(montageDeps, { userId: 'u1', files: cut.files as string[], prompt: cut.prompt });
  if (!q.ok) throw new Error(`montage refused: ${q.error} ${q.message}`);
  expect(q.quote).toMatchObject({ musicStartSec: 59, aspect: '9:16', ramp: { mode: 'mixed', byEnergy: true } });
  expect(q.quote.ramp!.slow).toBeGreaterThan(0);
  expect(q.quote.ramp!.fast).toBeGreaterThan(0);
  const queued = await enqueueMontageJob(montageDeps, { userId: 'u1', request: q.request, token: q.token });
  if (!queued.ok) throw new Error(`montage not queued: ${queued.error}`);
  const m = await workMontageJob(montageDeps, { jobId: queued.jobId, worker: 'w-montage' });
  if (m.ran !== true || m.outcome !== 'delivered') throw new Error(`montage: ${JSON.stringify(m)} ${store.rows.get(queued.jobId)?.error ?? ''}`);
  const master = local(m.videoUrl);
  const mqc = (store.rows.get(queued.jobId)!.result as { qc: { outcome: string; sources: SourceContribution[]; audio: AudioTiming } }).qc;
  expect(mqc.outcome).toBe('PASS');
  expect(mqc.audio).toMatchObject({ sourceStartSec: 59, timelineStartSec: 0 });
  const masterProbe = (await probeMedia(m.videoUrl))!;
  expect(masterProbe).toMatchObject({ hasVideo: true, hasAudio: true });
  expect(masterProbe.height / masterProbe.width).toBeCloseTo(16 / 9, 2); // the phone's 9:16

  // The track from its 0:59: the marker is the master's first 0.4 s, then quiet.
  expect(meanDb(master, 0, 0.36)).toBeGreaterThan(-12);
  expect(meanDb(master, 0.42, 0.06)).toBeLessThan(-40);

  // Every window of every shot, measured from the pictures: the brightness climbs 18 a source second, so a window's
  // climb per master second is its speed × 18; where it starts says the source second it starts at.
  const fps = 30;
  const y = lumas(master);
  const windows = mqc.sources.flatMap((s) => s.windows);
  const measured = windows.map((w) => {
    const from = Math.ceil(w.outStartSec * fps + 2), to = Math.floor(w.outEndSec * fps - 2); // off the cut's own frames
    const xs: number[] = [], ys: number[] = [];
    for (let f = from; f <= to; f += 1) { xs.push(f / fps); ys.push(y[f]!); }
    const k = slope(xs, ys);
    const srcAt = (y[from]! - 16) / LUMA_PER_SEC - (from / fps - w.outStartSec) * (w.speed ?? 1);
    return { asked: w.speed ?? 1, measured: Math.round((k / LUMA_PER_SEC) * 100) / 100, srcStartSec: w.srcStartSec, srcSeenSec: Math.round(srcAt * 100) / 100, outStartSec: w.outStartSec, outEndSec: w.outEndSec };
  });
  for (const w of measured) {
    expect([w, Math.abs(w.measured - w.asked) <= 0.08]).toEqual([w, true]);
    expect([w, Math.abs(w.srcSeenSec - w.srcStartSec) <= 0.25]).toEqual([w, true]);
  }
  const slow = measured.filter((w) => w.asked === 0.5), fast = measured.filter((w) => w.asked === 1.5);
  expect(slow.length).toBe(q.quote.ramp!.slow);
  expect(fast.length).toBe(q.quote.ramp!.fast);
  // By the music: every slow shot plays where the song is quiet (before 1:14 = 15 s into the master), every fast one
  // where it is loud.
  expect(slow.every((w) => w.outEndSec <= 15.5)).toBe(true);
  expect(fast.every((w) => w.outStartSec >= 14.5)).toBe(true);
  // The length is the plan's: a ramp changes what a shot shows, not how long it lasts.
  const frames = y.length;
  expect(Math.abs(frames - Math.round(q.quote.totalSec * fps))).toBeLessThanOrEqual(1);

  // ── step 2: the edit on the montage — the chain's own asks ──
  const editStep = spec.steps[1]!;
  if (editStep.tool !== 'edit') throw new Error('second step is not the edit');
  const done = await edit(m.videoUrl, editStep.edits);
  // The same overlay alone: the reference that tells the texts from the light.
  const ref = await edit(m.videoUrl, [{ op: 'overlay', look: 'light-leak' }]);
  const W = masterProbe.width!, H = masterProbe.height!, end = frames / fps;
  // Every frame of the montage is in the edit, the last ones (the end text's) too: the layers' pass ends at the
  // plan's length, not at the sound's (an AAC track ends a few hundredths early).
  const doneFrames = lumas(done.file).length;
  expect(doneFrames).toBe(frames);
  expect(lumas(ref.file).length).toBe(frames);

  const oqc = done.result.overlayQc as { outcome: string } | undefined;
  expect(oqc?.outcome).toBe('PASS');
  const lqc = done.result.layerQc as LayerQcRecord;
  expect(lqc.outcome).toBe('PASS');
  const [brand, cta] = lqc.checks;
  expect([brand!.text, cta!.text]).toEqual(['myavatar.ge🚀', 'გადმოდი საიტზე']);
  const layers = (done.request.edits.find((e) => e.op === 'layers') as { layers: TextLayer[] }).layers;
  // „myavatar.ge🚀" from the start until 3 s before the end, sliding up, cinematic; „გადმოდი საიტზე" the last 3 s.
  expect(layers.map((l) => ({ text: l.text, style: l.style, motionIn: l.motionIn, from: l.startSec, to: l.endSec }))).toEqual([
    { text: 'myavatar.ge🚀', style: 'cinematic', motionIn: 'slide-up', from: 0, to: expect.closeTo(end - 3, 2) },
    { text: 'გადმოდი საიტზე', style: 'brand', motionIn: 'slide-up', from: expect.closeTo(end - 3, 2), to: expect.closeTo(end, 2) },
  ]);

  // The overlay is over the whole picture: away from both texts the edit differs from the montage.
  const tMid = 8;
  const thirds: Rect[] = [0, 1, 2].map((k) => ({ x: 0, y: Math.round((k * H) / 3), w: W, h: Math.round(H / 3) }));
  // The light drifts: at every instant it lights some part of the frame, and over the video it reaches every third.
  const lightAt = [2, 8, 15, 22, 28].map((t) => { const a = rgb(ref.file, t, W, H), b = rgb(master, t, W, H); return { t, thirds: thirds.map((r) => diffIn(a, b, W, r)) }; });
  expect(lightAt.every((l) => Math.max(...l.thirds) > 4)).toBe(true);
  expect([0, 1, 2].every((k) => Math.max(...lightAt.map((l) => l.thirds[k]!)) > 4)).toBe(true);

  // „myavatar.ge🚀" until 3 s before the end, the rocket in its own red and blue; gone in the last 3 s.
  const shown = rgb(done.file, tMid, W, H), shownRef = rgb(ref.file, tMid, W, H);
  expect(diffIn(shown, shownRef, W, brand!.box)).toBeGreaterThan(10);
  const red = (r: number, g: number, b: number) => r > 120 && g < 70 && b < 90;
  const blue = (r: number, g: number, b: number) => b > 170 && r < 140 && g > 110 && g < 210;
  const rocketRed = count(shown, W, brand!.box, red), rocketBlue = count(shown, W, brand!.box, blue);
  expect(rocketRed).toBeGreaterThan(30);
  expect(rocketBlue).toBeGreaterThan(30);
  expect(count(shownRef, W, brand!.box, red)).toBe(0);
  const tEnd = end - 1.2;
  const last = rgb(done.file, tEnd, W, H), lastRef = rgb(ref.file, tEnd, W, H);
  expect(count(last, W, brand!.box, red)).toBe(0); // no rocket in the last 3 s
  // „გადმოდი საიტზე" in the last 3 s on the brand's blue button, not before.
  expect(diffIn(last, lastRef, W, cta!.box)).toBeGreaterThan(10);
  const button = (r: number, g: number, b: number) => b > 190 && r < 110 && g > 110 && g < 180;
  expect(count(last, W, cta!.box, button)).toBeGreaterThan(cta!.box.w * cta!.box.h * 0.2);
  // Before it, at most the rocket's own blue in that place (the two texts share the bottom, at different times).
  expect(count(rgb(done.file, end - 4, W, H), W, cta!.box, button)).toBeLessThan(cta!.box.w * cta!.box.h * 0.03);

  sheet('owner-montage-slow-normal-fast', [slow[0]!, measured.find((w) => w.asked === 1)!, fast[0]!].map((w) => ({ file: master, t: (w.outStartSec + w.outEndSec) / 2 })));
  sheet('owner-montage-edit', [{ file: master, t: tMid }, { file: done.file, t: tMid }, { file: done.file, t: end - 3.4 }, { file: done.file, t: end - 2.6 }, { file: done.file, t: tEnd }]);
  evidence.owner = {
    chain: { montage: chain.montage, edits: chain.edits },
    quote: { shots: q.quote.shots, totalSec: q.quote.totalSec, aspect: q.quote.aspect, bpm: q.quote.bpm, musicStartSec: q.quote.musicStartSec, ramp: q.quote.ramp },
    master: { frames, durationSec: masterProbe.durationSec, width: masterProbe.width, height: masterProbe.height, audio: mqc.audio, markerDb: meanDb(master, 0, 0.36), afterMarkerDb: meanDb(master, 0.42, 0.06) },
    windows: measured,
    light: lightAt,
    edit: { frames: doneFrames, overlayQc: oqc, layerQc: { outcome: lqc.outcome, checks: lqc.checks.map((c) => ({ text: c.text, box: c.box, atSec: c.atSec, shownDiff: c.shownDiff, beforeDiff: c.beforeDiff, afterDiff: c.afterDiff })) }, layers: layers.map((l) => ({ text: l.text, style: l.style, startSec: l.startSec, endSec: l.endSec, motionIn: l.motionIn })), rocket: { red: rocketRed, blue: rocketBlue } },
  };
});
