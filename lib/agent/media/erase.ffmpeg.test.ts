/** @jest-environment node */
/**
 * GG 2026-10-11 17:38Z: „ვიდეოში სადმე რამე ტექსტი თუარის ან რამის წაშლა ამოღება ან მოშორება მინდა არ აკეთებს". Erasing
 * what is in the picture itself, on the REAL bundled ffmpeg, from the owner's own words to the delivered file:
 *   E1  a logo top right and subtitles at the bottom of a video („… ლოგო მოაშორე და ქვედა სუბტიტრები წაშალე"): both
 *       places come back as the picture around them, and nothing outside them changes;
 *   E2  only the first 3 s („პირველ 3 წამში …"): erased at 0:01, still there at 0:04.5;
 *   E3  a watermark on a photo: a JPEG of the same size, the watermark gone.
 * Each runs quote → queue → worker → QC → stored file through the lease queue (in memory), like a user's job.
 * ERASE_DIR=<dir> keeps the frames (before / after) and evidence.json there.
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => null, reSignIfInternal: async (u: string) => u }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

jest.setTimeout(240_000);
const bin = ffmpegStatic as unknown as string;
const KEEP = process.env.ERASE_DIR;
let dir = '';
const evidence: Record<string, unknown> = {};

const W = 1280, H = 720;
/**
 * A smooth background (what a wall, a sky or a studio backdrop behind a logo looks like): colour changing evenly across
 * the frame. The fill comes from the box's edges, so on such a background it is the background again; on a busy one
 * (leaves, a crowd) it is a soft patch, which the report says.
 */
const smooth = (w: number, h: number) => `color=black:s=${w}x${h},format=rgb24,geq=r='40+90*X/W+30*Y/H':g='60+80*X/W+40*Y/H':b='120+60*X/W+50*Y/H'`;
/** A logo top right, and a line of subtitles at the bottom (white letters on the picture). */
const LOGO = 'drawbox=x=1010:y=24:w=210:h=64:c=white:t=fill,drawbox=x=1030:y=40:w=40:h=32:c=0xd02020:t=fill';
const SUBS = Array.from({ length: 10 }, (_, i) => `drawbox=x=${300 + i * 70}:y=620:w=48:h=40:c=white:t=fill`).join(',');
const LOGO_BOX = { x: 1000, y: 16, w: 230, h: 80 };
const SUBS_BOX = { x: 290, y: 612, w: 700, h: 56 };

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return out;
}

/** One frame as 8-bit grey at its own size (w × h). */
function grey(path: string, atSec: number, w: number, h: number): Buffer {
  return execFileSync(bin, ['-hide_banner', '-loglevel', 'error', ...(atSec > 0 ? ['-ss', String(atSec)] : []), '-i', path, '-frames:v', '1', '-vf', `scale=${w}:${h},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
}

type Box = { x: number; y: number; w: number; h: number };
/** The mean absolute difference of two frames inside a box (or outside every box given in `not`). */
function mad(a: Buffer, b: Buffer, w: number, h: number, inside: Box | null, not: Box[] = []): number {
  let sum = 0, n = 0;
  const inBox = (x: number, y: number, k: Box) => x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (inside ? !inBox(x, y, inside) : not.some((k) => inBox(x, y, k))) continue;
      sum += Math.abs(a[y * w + x]! - b[y * w + x]!);
      n += 1;
    }
  }
  return sum / n;
}
const r1 = (n: number) => Math.round(n * 10) / 10;

function snapshot(name: string, path: string, atSec: number): void {
  if (!KEEP) return;
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...(atSec > 0 ? ['-ss', String(atSec)] : []), '-i', path, '-frames:v', '1', '-update', '1', join(KEEP, name)]);
}

/** The owner's words → the edit quote → the queue → the worker on the real ffmpeg → the stored file. */
async function job(source: string, words: string, output: 'mp4' | 'jpg'): Promise<{ file: string; edits: MediaEdit[]; plan: EditRequest['plan'] }> {
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
  const worked = await workEditJob(deps, { jobId: q.quote.jobId, worker: 'w1' });
  expect(worked).toMatchObject({ ran: true, outcome: 'delivered' });
  const file = join(dir, `result-${ids}.${output}`);
  writeFileSync(file, stored[0]!);
  return { file, edits: q.quote.edits, plan: q.quote.plan };
}

let CLEAN = '', MARKED = '';

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-erase-'));
  if (KEEP) mkdirSync(KEEP, { recursive: true });
  const enc = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-c:a', 'aac'];
  const tone = ['-f', 'lavfi', '-i', 'sine=frequency=330:duration=6'];
  const bg = make('bg.png', ['-f', 'lavfi', '-i', smooth(W, H), '-frames:v', '1', '-update', '1']);
  const still = ['-loop', '1', '-framerate', '25', '-t', '6', '-i', bg];
  CLEAN = make('clean.mp4', [...still, ...tone, ...enc, '-shortest']);
  MARKED = make('marked.mp4', [...still, ...tone, '-vf', `${LOGO},${SUBS}`, ...enc, '-shortest']);
});

afterAll(() => {
  if (KEEP) writeFileSync(join(KEEP, 'evidence.json'), JSON.stringify(evidence, null, 2));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

test('E1: a logo top right and subtitles at the bottom, erased from the owner\'s words; nothing else changes', async () => {
  const r = await job(MARKED, 'ზედა მარჯვენა კუთხეში ლოგო მოაშორე და ქვედა სუბტიტრები წაშალე', 'mp4');
  expect(r.edits).toEqual([{ op: 'erase', boxes: [
    { x: 0.03, y: 0.8, w: 0.94, h: 0.19, at: 'bottom' },
    { x: 0.69, y: 0.01, w: 0.3, h: 0.14, at: 'top-right' },
  ] }]);
  expect(r.plan).toMatchObject({ output: 'mp4', durationSec: 6, width: W, height: H, hasAudio: true, frame: { width: W, height: H } });
  const at = 2;
  const clean = grey(CLEAN, at, W, H), marked = grey(MARKED, at, W, H), out = grey(r.file, at, W, H);
  const m = {
    logoBefore: r1(mad(marked, clean, W, H, LOGO_BOX)), logoAfter: r1(mad(out, clean, W, H, LOGO_BOX)),
    subsBefore: r1(mad(marked, clean, W, H, SUBS_BOX)), subsAfter: r1(mad(out, clean, W, H, SUBS_BOX)),
    // Outside the two erased places (the whole box each, not only the marks): the picture as it was.
    outside: r1(mad(out, marked, W, H, null, [
      { x: Math.round(0.69 * W), y: 0, w: W, h: Math.round(0.16 * H) },
      { x: 0, y: Math.round(0.79 * H), w: W, h: H },
    ])),
  };
  evidence.E1 = { words: 'ზედა მარჯვენა კუთხეში ლოგო მოაშორე და ქვედა სუბტიტრები წაშალე', edits: r.edits, ...m };
  snapshot('E1-before.png', MARKED, at);
  snapshot('E1-after.png', r.file, at);
  // The marks were there (a white logo and white letters, far from the background) …
  expect(m.logoBefore).toBeGreaterThan(40);
  expect(m.subsBefore).toBeGreaterThan(40);
  // … and are gone: the places are the background again, to a few grey levels.
  expect(m.logoAfter).toBeLessThan(4);
  expect(m.subsAfter).toBeLessThan(4);
  expect(m.outside).toBeLessThan(1.5);
});

test('E2: only the first 3 s: erased at 0:01, still there at 0:04.5', async () => {
  const r = await job(MARKED, 'პირველ 3 წამში ზედა მარჯვენა კუთხეში ლოგო მოაშორე', 'mp4');
  expect(r.edits).toEqual([{ op: 'erase', boxes: [{ x: 0.69, y: 0.01, w: 0.3, h: 0.14, at: 'top-right', fromSec: 0, toSec: 3 }] }]);
  expect(r.plan.durationSec).toBe(6);
  const early = r1(mad(grey(r.file, 1, W, H), grey(CLEAN, 1, W, H), W, H, LOGO_BOX));
  const late = r1(mad(grey(r.file, 4.5, W, H), grey(MARKED, 4.5, W, H), W, H, LOGO_BOX));
  evidence.E2 = { words: 'პირველ 3 წამში ზედა მარჯვენა კუთხეში ლოგო მოაშორე', edits: r.edits, erasedAt1s: early, keptAt4_5sVsSource: late };
  snapshot('E2-at-1s.png', r.file, 1);
  snapshot('E2-at-4.5s.png', r.file, 4.5);
  expect(early).toBeLessThan(4);
  expect(late).toBeLessThan(2);
});

test('E3: a watermark on a photo: a JPEG of the same size, the watermark gone', async () => {
  const PW = 1200, PH = 1600;
  const bg = smooth(PW, PH);
  const photoClean = make('photo-clean.png', ['-f', 'lavfi', '-i', bg, '-frames:v', '1', '-update', '1']);
  const photo = make('photo.jpg', ['-f', 'lavfi', '-i', `${bg},drawbox=x=880:y=1420:w=280:h=120:c=white@0.85:t=fill`, '-frames:v', '1', '-update', '1', '-q:v', '2']);
  copyFileSync(photo, join(dir, 'photo-src.jpg'));
  const r = await job(photo, 'remove the watermark in the bottom right corner', 'jpg');
  expect(r.edits).toEqual([{ op: 'erase', boxes: [{ x: 0.69, y: 0.85, w: 0.3, h: 0.14, at: 'bottom-right' }] }]);
  expect(r.plan).toMatchObject({ output: 'jpg', still: true, width: PW, height: PH, frame: { width: PW, height: PH } });
  const mark = { x: 880, y: 1420, w: 280, h: 120 };
  const before = r1(mad(grey(photo, 0, PW, PH), grey(photoClean, 0, PW, PH), PW, PH, mark));
  const after = r1(mad(grey(r.file, 0, PW, PH), grey(photoClean, 0, PW, PH), PW, PH, mark));
  evidence.E3 = { words: 'remove the watermark in the bottom right corner', edits: r.edits, before, after };
  snapshot('E3-before.png', photo, 0);
  snapshot('E3-after.png', r.file, 0);
  expect(before).toBeGreaterThan(40);
  expect(after).toBeLessThan(5);
});

test('E4: erased and written in one message: the logo gone, the new words drawn (the layer QC passes on the erased picture)', async () => {
  const words = 'ზედა მარჯვენა კუთხეში ლოგო მოაშორე და ქვემოთ დააწერე "MyAvatar"';
  const r = await job(MARKED, words, 'mp4');
  expect(r.edits.map((e) => e.op)).toEqual(['erase', 'layers']);
  expect(r.edits[0]).toEqual({ op: 'erase', boxes: [{ x: 0.69, y: 0.01, w: 0.3, h: 0.14, at: 'top-right' }] });
  const at = 3;
  const logoAfter = r1(mad(grey(r.file, at, W, H), grey(CLEAN, at, W, H), W, H, LOGO_BOX));
  // The words are drawn at the bottom (over the subtitles, which this message did not ask to remove).
  const bottomChanged = r1(mad(grey(r.file, at, W, H), grey(MARKED, at, W, H), W, H, { x: 0, y: Math.round(0.6 * H), w: W, h: Math.round(0.4 * H) }));
  evidence.E4 = { words, edits: r.edits, logoAfter, bottomChanged };
  snapshot('E4-after.png', r.file, at);
  expect(logoAfter).toBeLessThan(4);
  expect(bottomChanged).toBeGreaterThan(1);
});
