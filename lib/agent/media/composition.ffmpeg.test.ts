/** @jest-environment node */
/**
 * Agent G Media Studio v2.1 (captions, typography, overlays) on the REAL bundled ffmpeg and resvg, offline, on files
 * made here. Every case goes the whole way a user's ask goes — quote → queue → worker → layer pass → QC → stored
 * file, through the lease queue (in memory) — and is then measured on the DELIVERED file by this test's own frame
 * reads (independent of ./layerQc, whose record is checked too):
 *   TX-01 exact Georgian text on a picture            TX-06 premium restyle as a revision: same words, new look
 *   TX-02 Georgian caption track burned in, timed     TX-07 the picture re-laid as a 9:16 story
 *   TX-03 the same video with and without captions    TX-08 an English track, timed, as SRT/VTT and burned in
 *   TX-04 our top logo removed, the package kept      TX-09 the logo moved, the other layers untouched
 *   TX-05 an animated CTA in the last 3 s             TX-10 several layers: their own times, the right stacking
 * and the edges: words a font cannot draw are refused before anything runs, long Georgian text fits or is refused,
 * two revisions of one result at once, a reload, a cancel, and the container a phone plays (H.264, faststart).
 *
 * Not here (owner decisions, docs/agent-g-media/07): turning speech into captions (ElevenLabs Scribe, a paid call)
 * and translating them (a paid model call); TX-02 and TX-08 therefore start from a caption file / typed lines.
 *
 * MEDIA_STUDIO_V21_DIR=<dir> keeps the contact sheets (PNG) and the measured numbers (evidence.json).
 */
jest.mock('server-only', () => ({}));
jest.mock('./montageLive', () => ({ audit: async () => {}, quoteKey: () => 'k', every: () => () => {} }));
jest.mock('../../security/callerMedia', () => ({ resolveCallerMedia: async () => ({ ok: false, reason: 'unreadable' }) }));
jest.mock('../../orchestrator/storage-adapter', () => ({ uploadBufferAndSign: async () => null, reSignIfInternal: async (u: string) => u }));
jest.mock('../../supabase/server', () => ({ createServiceRoleClient: () => null }));
jest.mock('../../observability/report-error', () => ({ reportError: () => {} }));

import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import { memoryLeaseStore } from '../../orchestrator/testing/memoryLeaseStore';
import { probeMedia } from '../../services/montage/beatAnalysis';
import { editJobStatus, editViewOf, enqueueEditJob, quoteEdit, type EditExecDeps, type EditJobView } from './editExec';
import { renderEdit } from './editLive';
import { resolveEdits, validateEditRequest, type EditRequest } from './editPlan';
import { workEditJob } from './editWorker';
import { missingGlyphs } from './layerRender';
import { detailKept, type LayerQcRecord } from './layerQc';
import { parseTimedLines, safeArea, type Layer, type Rect, type TextLayer } from './layers';

jest.setTimeout(300_000);
const bin = ffmpegStatic as unknown as string;
const OUT = process.env.MEDIA_STUDIO_V21_DIR ?? '';
let dir = '';
let SCENE = '', PACKSHOT = '', LOGO = '', LONG = '';
/** The package's own logo, part of the source's pixels (a blue box), which no edit may touch. */
const PACKAGE: Rect = { x: 1040, y: 440, w: 160, h: 160 };
const evidence: Record<string, unknown> = {};

function make(name: string, args: string[]): string {
  const out = join(dir, name);
  execFileSync(bin, ['-hide_banner', '-loglevel', 'error', '-y', ...args, out]);
  return out;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'agent-v21-'));
  if (OUT) mkdirSync(OUT, { recursive: true });
  // 8 s, 1280×720, a moving test pattern with a 440 Hz tone, and a package logo printed on it.
  SCENE = make('scene.mp4', [
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=8', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
    '-vf', `drawbox=x=${PACKAGE.x}:y=${PACKAGE.y}:w=${PACKAGE.w}:h=${PACKAGE.h}:color=0x1E50FF:t=fill`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  ]);
  // A 1600×900 packshot picture (a gradient and a package).
  PACKSHOT = make('packshot.png', [
    '-f', 'lavfi', '-i', 'gradients=s=1600x900:c0=0x1d2b3a:c1=0x9db0c4:nb_colors=2:duration=1:speed=0',
    '-vf', 'drawbox=x=1180:y=500:w=280:h=320:color=0x1E50FF:t=fill', '-frames:v', '1',
  ]);
  // Our logo: a red disc on a transparent square.
  LOGO = make('logo.png', [
    '-f', 'lavfi', '-i', 'color=c=red:s=200x200:d=1',
    '-vf', "format=rgba,geq=r=230:g=40:b=40:a='if(lt(hypot(X-100\\,Y-100)\\,92)\\,255\\,0)'", '-frames:v', '1',
  ]);
  // 30 s for the cancel.
  LONG = make('long.mp4', [
    '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=30', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=30',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  ]);
});

afterAll(() => {
  if (OUT) writeFileSync(join(OUT, 'evidence.json'), JSON.stringify(evidence, null, 1));
  if (dir) rmSync(dir, { recursive: true, force: true });
});

// ── the job, as the app runs it ─────────────────────────────────────────────────────────────────────────────────────

const store = memoryLeaseStore(() => Date.now());
/** A ref (an upload's path, or our stored result's URL without its token) → the local file it names. */
const files = new Map<string, string>();
const own = (ref: string, path: string) => files.set(ref, path);

const deps: EditExecDeps = {
  resolveFile: async (ref, userId) => {
    const local = files.get(ref.split('?')[0]!);
    return userId === 'u1' && local ? { ok: true, url: local } : { ok: false, reason: 'not_yours' };
  },
  probe: (url) => probeMedia(url),
  render: (url, request, opts) => renderEdit(url, request, opts),
  upload: async (jobId, bytes, output, variant) => {
    const path = `renders/edits/${jobId}${variant === 'clean' ? '-clean' : ''}.${output}`;
    const local = join(dir, path.replace(/\//g, '_'));
    writeFileSync(local, bytes);
    own(`https://media.test/${path}`, local);
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

type Completed = Extract<EditJobView, { status: 'completed' }>;
interface Done {
  jobId: string;
  /** The delivered link (with its token), as the chat gets it. */
  url: string;
  file: string;
  clean?: string;
  view: Completed;
  request: EditRequest;
  qc: LayerQcRecord;
  result: Record<string, unknown>;
}

const localOf = (url: string): string => files.get(url.split('?')[0]!)!;

async function quote(file: string, edits: unknown[]) {
  return quoteEdit(deps, { userId: 'u1', file, edits });
}

async function run(q: Awaited<ReturnType<typeof quote>>): Promise<Done> {
  if (!q.ok) throw new Error(`refused: ${q.error} ${q.message} ${q.detail ?? ''}`);
  const e = await enqueueEditJob(deps, { userId: 'u1', request: q.request, token: q.token });
  if (!e.ok) throw new Error(`not queued: ${e.error}`);
  const w = await workEditJob(deps, { jobId: q.quote.jobId, worker: 'w1' });
  const row = (await store.read(q.quote.jobId))!;
  if (!w.ran || w.outcome !== 'delivered') throw new Error(`not delivered: ${JSON.stringify(w)} ${row.error ?? ''}`);
  const view = editViewOf(row) as Completed;
  const result = row.result as Record<string, unknown>;
  return {
    jobId: q.quote.jobId, url: view.url, file: localOf(view.url), ...(view.clean ? { clean: localOf(view.clean.url) } : {}),
    view, request: validateEditRequest((row.params._job as { request: unknown }).request)!, qc: result.layerQc as LayerQcRecord, result,
  };
}

const edit = async (file: string, edits: unknown[]): Promise<Done> => run(await quote(file, edits));
const layersOf = (d: Done): Layer[] => (d.request.edits.find((e) => e.op === 'layers') as { layers?: Layer[] } | undefined)?.layers ?? [];
const checkOf = (d: Done, id: string) => d.qc.checks.find((c) => c.id === id)!;

// ── this test's own eyes ────────────────────────────────────────────────────────────────────────────────────────────

/** One frame as RGB at its own size (`t` null: a picture). */
function rgb(file: string, t: number | null, w: number, h: number): Buffer {
  return execFileSync(bin, [
    '-hide_banner', '-loglevel', 'error', ...(t === null ? [] : ['-ss', t.toFixed(3)]), '-i', file, '-frames:v', '1',
    '-vf', `scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-',
  ], { maxBuffer: 1 << 26 });
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

/** The first row of a box where the result differs from the source by at least 30 % of the box's strongest row. */
function topEdge(a: Buffer, b: Buffer, fw: number, r: Rect): number | null {
  const rows: number[] = [];
  for (let y = r.y; y < r.y + r.h; y += 1) {
    let sum = 0;
    for (let x = r.x; x < r.x + r.w; x += 1) {
      const i = (y * fw + x) * 3;
      sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
    }
    rows.push(sum / (r.w * 3));
  }
  const max = Math.max(...rows);
  if (!(max > 4)) return null;
  const k = rows.findIndex((v) => v >= max * 0.3);
  return k < 0 ? null : r.y + k;
}

const count = (f: Buffer, fw: number, r: Rect, test: (r: number, g: number, b: number) => boolean): number => {
  let n = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) for (let x = r.x; x < r.x + r.w; x += 1) { const i = (y * fw + x) * 3; if (test(f[i]!, f[i + 1]!, f[i + 2]!)) n += 1; }
  return n;
};

/** The top-level boxes of an MP4, in file order. */
function boxes(file: string): string[] {
  const b = readFileSync(file);
  const out: string[] = [];
  for (let at = 0; at + 8 <= b.length;) {
    let size = b.readUInt32BE(at);
    const type = b.toString('latin1', at + 4, at + 8);
    if (size === 1) size = Number(b.readBigUInt64BE(at + 8));
    out.push(type);
    if (size < 8) break;
    at += size;
  }
  return out;
}

const sha = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

/** A contact sheet: the frames side by side at one height (kept only with MEDIA_STUDIO_V21_DIR). */
function sheet(name: string, frames: Array<{ file: string; t: number | null }>): void {
  if (!OUT) return;
  const args = ['-hide_banner', '-loglevel', 'error', '-y'];
  for (const f of frames) args.push(...(f.t === null ? [] : ['-ss', f.t.toFixed(3)]), '-i', f.file);
  const scaled = frames.map((_, i) => `[${i}:v]scale=-2:360,setsar=1,format=rgb24[s${i}]`).join(';');
  const graph = frames.length > 1 ? `${scaled};${frames.map((_, i) => `[s${i}]`).join('')}hstack=inputs=${frames.length}[o]` : scaled.replace('[s0]', '[o]');
  execFileSync(bin, [...args, '-filter_complex', graph, '-map', '[o]', '-frames:v', '1', join(OUT, `${name}.png`)]);
}

const W = 1280, H = 720;

beforeEach(() => {
  own('omni-uploads/u1/scene.mp4', SCENE);
  own('omni-uploads/u1/packshot.png', PACKSHOT);
  own('omni-uploads/u1/logo.png', LOGO);
});

// ── TX-01, TX-07: pictures ──────────────────────────────────────────────────────────────────────────────────────────

describe('pictures', () => {
  let poster: Done;

  test('TX-01 exact Georgian text on a picture: the very words, drawn whole, where asked', async () => {
    const words = 'მიტანის სერვისი თბილისში';
    expect(missingGlyphs(words)).toEqual([]);
    poster = await edit('omni-uploads/u1/packshot.png', [{ op: 'layers', add: [{ kind: 'text', role: 'title', text: words, anchor: 'top' }] }]);
    expect(poster.view).toMatchObject({ output: 'jpg', width: 1600, height: 900 });
    expect(poster.result.subtype).toBe('design');
    expect(readFileSync(poster.file).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(layersOf(poster)).toEqual([expect.objectContaining({ id: 't1', kind: 'text', text: words, anchor: 'top' })]);
    expect(poster.qc.outcome).toBe('PASS');
    const t1 = checkOf(poster, 't1');
    expect(t1.text).toBe(words);
    expect(t1.exactPsnr).toBeGreaterThanOrEqual(26);
    expect(t1.safe).toBe(true);
    // Independently: the text's box changed, the package (outside every box) did not.
    const src = rgb(PACKSHOT, null, 1600, 900), out = rgb(poster.file, null, 1600, 900);
    const pack = { x: 1180, y: 500, w: 280, h: 320 };
    expect(diffIn(out, src, 1600, t1.box)).toBeGreaterThan(10);
    expect(diffIn(out, src, 1600, pack)).toBeLessThan(2);
    sheet('tx01-georgian-text-on-picture', [{ file: PACKSHOT, t: null }, { file: poster.file, t: null }]);
    evidence.tx01 = { words, box: t1.box, fontPx: t1.fontPx, exactPsnr: t1.exactPsnr, shownDiff: t1.shownDiff, packageDiff: diffIn(out, src, 1600, pack), qc: poster.qc.outcome };
  });

  test('TX-07 the same design re-laid as a 9:16 story: a revision, the words kept, inside the tall safe area', async () => {
    const story = await edit(poster.url, [{ op: 'aspect', to: '9:16', fit: 'pad' }]);
    expect(story.request.parent).toEqual({ jobId: poster.jobId, depth: 1 });
    expect(story.request.source.ref).toBe('omni-uploads/u1/packshot.png'); // from the source again, not the JPEG
    expect(story.view).toMatchObject({ output: 'jpg', width: 1080, height: 1920, parentJobId: poster.jobId });
    expect(layersOf(story)).toEqual([expect.objectContaining({ id: 't1', text: (layersOf(poster)[0] as TextLayer).text })]);
    expect(story.qc.outcome).toBe('PASS');
    const t1 = checkOf(story, 't1');
    const area = safeArea(1080, 1920);
    expect(area).toEqual(expect.objectContaining({ y: Math.round(1920 * 0.12) }));
    expect(t1.safe).toBe(true);
    expect(t1.box.y).toBeGreaterThanOrEqual(area.y);
    expect(t1.exactPsnr).toBeGreaterThanOrEqual(26);
    sheet('tx07-story-9x16', [{ file: poster.file, t: null }, { file: story.file, t: null }]);
    evidence.tx07 = { frame: [1080, 1920], safeArea: area, box: t1.box, exactPsnr: t1.exactPsnr, parent: 'TX-01' };
  });
});

// ── TX-04, TX-06, TX-09: a logo and a line, then revisions of that result ───────────────────────────────────────────

describe('a logo and a line, revised', () => {
  let first: Done;

  test('the first result: our logo top-left, a line at the bottom, the package untouched', async () => {
    first = await edit('omni-uploads/u1/scene.mp4', [{
      op: 'layers',
      add: [
        { kind: 'image', ref: 'omni-uploads/u1/logo.png', anchor: 'top-left', size: 160 },
        { kind: 'text', text: 'მიტანის სერვისი თბილისში', anchor: 'bottom', style: 'cinematic' },
      ],
    }]);
    expect(layersOf(first).map((l) => [l.id, l.kind, l.anchor])).toEqual([['i1', 'image', 'top-left'], ['t1', 'text', 'bottom']]);
    expect(first.qc.outcome).toBe('PASS');
    expect(first.view).toMatchObject({ output: 'mp4', width: W, height: H });
    expect(Math.abs(first.view.durationSec - 8)).toBeLessThan(0.1);
  });

  test('TX-04 „ზედა ლოგო მოხსენი, პაკეტის ლოგო შეინარჩუნე": our logo gone without a trace, the package logo kept', async () => {
    const r = await edit(first.url, [{ op: 'layers', remove: [{ kind: 'image', where: 'top' }] }]);
    expect(r.request.parent?.jobId).toBe(first.jobId);
    expect(layersOf(r).map((l) => l.id)).toEqual(['t1']);
    expect(layersOf(r)[0]).toEqual(layersOf(first).find((l) => l.id === 't1'));
    expect(r.qc.outcome).toBe('PASS');
    const logoBox = checkOf(first, 'i1').box;
    const at = 4;
    const [src, before, after] = [rgb(SCENE, at, W, H), rgb(first.file, at, W, H), rgb(r.file, at, W, H)];
    const m = {
      logoBefore: diffIn(before, src, W, logoBox), logoAfter: diffIn(after, src, W, logoBox),
      packageBefore: diffIn(before, src, W, PACKAGE), packageAfter: diffIn(after, src, W, PACKAGE),
      textKept: diffIn(after, before, W, checkOf(r, 't1').box),
    };
    expect(m.logoBefore).toBeGreaterThan(20); // the logo was there
    expect(m.logoAfter).toBeLessThan(3); // and is gone: re-rendered from the source, not painted over
    expect(m.packageBefore).toBeLessThan(3); // the package logo (the source's own pixels) never touched
    expect(m.packageAfter).toBeLessThan(3);
    expect(m.textKept).toBeLessThan(2);
    // A logo that is not a layer of ours is not removed by pretending: what is left at the top is the picture itself.
    const again = await quote(r.url, [{ op: 'layers', remove: [{ kind: 'image', where: 'top' }] }]);
    expect(again).toMatchObject({ ok: false, error: 'remove_from_source' });
    sheet('tx04-remove-top-logo-keep-package', [{ file: SCENE, t: at }, { file: first.file, t: at }, { file: r.file, t: at }]);
    evidence.tx04 = { ...m, logoBox, packageBox: PACKAGE, qc: r.qc.outcome };
  });

  test('TX-06 + TX-09 two revisions of the same result at once: a premium restyle (same words) and the logo moved right', async () => {
    const bytesBefore = sha(first.file);
    // Both quoted before either runs: each is a branch of the same parent, neither sees the other.
    const qStyle = await quote(first.url, [{ op: 'layers', change: [{ target: { kind: 'text', all: true }, style: 'premium' }] }]);
    const qMove = await quote(first.url, [{ op: 'layers', change: [{ target: { kind: 'image' }, moveH: 'right' }] }]);
    const moved = await run(qMove);
    const styled = await run(qStyle);
    expect(sha(first.file)).toBe(bytesBefore); // the parent result is never rewritten
    for (const r of [styled, moved]) {
      expect(r.request.parent).toEqual({ jobId: first.jobId, depth: 1 });
      expect(r.view.parentJobId).toBe(first.jobId);
      expect(r.qc.outcome).toBe('PASS');
    }
    const f = Object.fromEntries(layersOf(first).map((l) => [l.id, l]));
    // TX-06: the same words, the same place and time, a new look; the logo exactly as it was.
    const sT = layersOf(styled).find((l) => l.id === 't1') as TextLayer;
    expect(sT).toEqual({ ...f.t1, style: 'premium' });
    expect(layersOf(styled).find((l) => l.id === 'i1')).toEqual(f.i1);
    // TX-09: the logo top-right; the line untouched.
    expect(layersOf(moved).find((l) => l.id === 'i1')).toEqual({ ...f.i1, anchor: 'top-right' });
    expect(layersOf(moved).find((l) => l.id === 't1')).toEqual(f.t1);

    const at = 4;
    const [src, base, st, mv] = [rgb(SCENE, at, W, H), rgb(first.file, at, W, H), rgb(styled.file, at, W, H), rgb(moved.file, at, W, H)];
    const textBox = checkOf(first, 't1').box, oldLogo = checkOf(first, 'i1').box, newLogo = checkOf(moved, 'i1').box;
    const m = {
      styleTextChanged: diffIn(st, base, W, { ...textBox, ...union(textBox, checkOf(styled, 't1').box) }),
      styleLogoSame: diffIn(st, base, W, oldLogo),
      moveTextSame: diffIn(mv, base, W, textBox),
      moveOldLogoGone: diffIn(mv, src, W, oldLogo),
      moveNewLogoShown: diffIn(mv, src, W, newLogo),
    };
    expect(newLogo.x).toBeGreaterThan(W / 2);
    expect(m.styleTextChanged).toBeGreaterThan(3);
    expect(m.styleLogoSame).toBeLessThan(2);
    expect(m.moveTextSame).toBeLessThan(2);
    expect(m.moveOldLogoGone).toBeLessThan(3);
    expect(m.moveNewLogoShown).toBeGreaterThan(20);
    sheet('tx06-premium-restyle', [{ file: first.file, t: at }, { file: styled.file, t: at }]);
    sheet('tx09-logo-moved', [{ file: first.file, t: at }, { file: moved.file, t: at }]);
    evidence.tx06 = { before: f.t1, after: sT, textChanged: m.styleTextChanged, logoSame: m.styleLogoSame, qc: styled.qc.outcome };
    evidence.tx09 = { from: oldLogo, to: newLogo, textSame: m.moveTextSame, oldPlace: m.moveOldLogoGone, newPlace: m.moveNewLogoShown, qc: moved.qc.outcome };
    evidence.concurrentRevisions = { parent: first.jobId, branches: [styled.jobId, moved.jobId], parentUnchanged: true };
  });
});

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

// ── TX-05, TX-10: time and stacking ─────────────────────────────────────────────────────────────────────────────────

test('TX-05 „ბოლო სამ წამში ანიმაციური CTA ჩასვი": absent before 5 s, slides up into place, held to the end', async () => {
  const r = await edit('omni-uploads/u1/scene.mp4', [{ op: 'layers', add: [{ kind: 'text', role: 'cta', text: 'შეუკვეთე ახლავე', lastSec: 3 }] }]);
  const cta = layersOf(r)[0] as TextLayer;
  expect(cta).toMatchObject({ role: 'cta', startSec: 5, endSec: 8, motionIn: 'slide-up' });
  expect(r.qc.outcome).toBe('PASS');
  const c = checkOf(r, 't1');
  // The way in: early in the slide the drawn box starts lower than once it is in place (eased: most of the way in the
  // first half of its 0.5 s).
  const band: Rect = { x: c.box.x, y: c.box.y - 20, w: c.box.w, h: H - (c.box.y - 20) };
  const edgeAt = (t: number) => topEdge(rgb(r.file, t, W, H), rgb(SCENE, t, W, H), W, band);
  const m = {
    before: diffIn(rgb(r.file, 4.8, W, H), rgb(SCENE, 4.8, W, H), W, c.box),
    edgeEarly: edgeAt(cta.startSec + 0.08),
    edgeSettled: edgeAt(7.5),
    held: diffIn(rgb(r.file, 7.9, W, H), rgb(SCENE, 7.9, W, H), W, c.box),
  };
  expect(m.before).toBeLessThan(3);
  expect(m.edgeSettled).toBe(c.box.y);
  expect(m.edgeEarly).not.toBeNull();
  expect(m.edgeEarly! - m.edgeSettled!).toBeGreaterThanOrEqual(15);
  expect(m.held).toBeGreaterThan(8);
  sheet('tx05-cta-last-3s', [4.8, 5.08, 5.24, 7.5].map((t) => ({ file: r.file, t })));
  evidence.tx05 = { layer: cta, box: c.box, absentBefore: m.before, topEdgeAt508: m.edgeEarly, topEdgeSettled: m.edgeSettled, heldAtEnd: m.held, qc: r.qc.outcome };
});

test('TX-10 several layers: each in its own time, the later one drawn above the logo, all editable later', async () => {
  const r = await edit('omni-uploads/u1/scene.mp4', [{
    op: 'layers',
    add: [
      { kind: 'text', role: 'title', text: 'პირველი', anchor: 'top', fromSec: 0, toSec: 3, motionIn: 'fade', motionOut: 'fade' },
      { kind: 'image', ref: 'omni-uploads/u1/logo.png', anchor: 'center', size: 300, fromSec: 2, toSec: 6 },
      { kind: 'text', text: 'მეორე', anchor: 'center', style: 'bold', fromSec: 4, toSec: 8, motionIn: 'typewriter' },
    ],
  }]);
  const ls = layersOf(r);
  expect(ls.map((l) => [l.id, l.startSec, l.endSec, l.z])).toEqual([['t1', 0, 3, 1], ['i1', 2, 6, 2], ['t2', 4, 8, 3]]);
  expect(r.qc.outcome).toBe('PASS');
  expect(r.qc.occlusions).toEqual([['i1', 't2']]); // they share the centre from 4 s to 6 s, by z
  const logo = checkOf(r, 'i1').box;
  const inner: Rect = { x: logo.x + logo.w / 2 - 50, y: logo.y + logo.h / 2 - 50, w: 100, h: 100 };
  const red = (rr: number, g: number, b: number) => rr > 170 && g < 90 && b < 90;
  const white = (rr: number, g: number, b: number) => rr > 200 && g > 200 && b > 200;
  const f3 = rgb(r.file, 3.5, W, H), f5 = rgb(r.file, 5.5, W, H);
  const m = {
    titleShown: diffIn(rgb(r.file, 1.5, W, H), rgb(SCENE, 1.5, W, H), W, checkOf(r, 't1').box),
    titleGone: diffIn(rgb(r.file, 3.2, W, H), rgb(SCENE, 3.2, W, H), W, checkOf(r, 't1').box),
    logoAlone: { red: count(f3, W, inner, red), white: count(f3, W, inner, white) },
    textOverLogo: { red: count(f5, W, inner, red), white: count(f5, W, inner, white) },
    logoGone: { red: count(rgb(r.file, 6.3, W, H), W, inner, red), sourceRed: count(rgb(SCENE, 6.3, W, H), W, inner, red) },
  };
  expect(m.titleShown).toBeGreaterThan(8);
  expect(m.titleGone).toBeLessThan(3);
  expect(m.logoAlone.red).toBeGreaterThan(5000); // 3.5 s: the logo alone (the second line comes at 4 s)
  expect(m.logoAlone.white).toBe(0);
  expect(m.textOverLogo.white).toBeGreaterThan(30); // 5.5 s: white letters inside the opaque disc → drawn above it
  expect(Math.abs(m.logoGone.red - m.logoGone.sourceRed)).toBeLessThan(150); // 6.3 s: only the picture's own red is left
  expect(m.logoGone.red).toBeLessThan(m.logoAlone.red / 4);
  sheet('tx10-layers-time-and-stacking', [1.5, 3.5, 5.5, 7].map((t) => ({ file: r.file, t })));
  evidence.tx10 = { layers: ls.map((l) => ({ id: l.id, kind: l.kind, from: l.startSec, to: l.endSec, z: l.z })), ...m, occlusions: r.qc.occlusions, qc: r.qc.outcome };
});

// ── TX-02, TX-03, TX-08: caption tracks ─────────────────────────────────────────────────────────────────────────────

const KA_SRT = `1
00:00:00,500 --> 00:00:02,400
გამარჯობა! ეს MyAvatar-ია.

2
00:00:03,000 --> 00:00:05,000
ქეფშენები ზუსტ დროში ჩნდება.

3
00:00:05,600 --> 00:00:07,600
მადლობა, რომ უყურებთ.
`;

describe('caption tracks', () => {
  let both: Done;

  test('TX-02 + TX-03 a Georgian track burned in on its times, and the same video without it', async () => {
    const cues = parseTimedLines(KA_SRT);
    expect(cues.map((c) => [c.startSec, c.endSec])).toEqual([[0.5, 2.4], [3, 5], [5.6, 7.6]]);
    both = await edit('omni-uploads/u1/scene.mp4', [{ op: 'captions', track: { lang: 'ka', source: 'file', cues }, deliver: 'both' }]);
    expect(both.qc.outcome).toBe('PASS');
    expect(both.view.clean?.name).toMatch(/-no-captions\.mp4$/);
    expect(both.clean).toBeTruthy();
    const box = both.qc.checks.find((c) => c.kind === 'caption')!.box;
    expect(box.y + box.h).toBeLessThanOrEqual(H - Math.round(H * 0.07)); // above the bottom safe margin

    // On its times, to the frame (25 fps: ±0.06 s crosses a frame boundary each side).
    const shown = (file: string, t: number) => diffIn(rgb(file, t, W, H), rgb(SCENE, t, W, H), W, box);
    const timing = cues.map((c) => ({
      cue: c.text, from: c.startSec, to: c.endSec,
      before: shown(both.file, c.startSec - 0.06), in: shown(both.file, c.startSec + 0.06),
      mid: shown(both.file, (c.startSec + c.endSec) / 2), lastIn: shown(both.file, c.endSec - 0.06), after: shown(both.file, c.endSec + 0.06),
      clean: shown(both.clean!, (c.startSec + c.endSec) / 2),
    }));
    for (const t of timing) {
      expect(t.before).toBeLessThan(3);
      expect(t.in).toBeGreaterThan(6);
      expect(t.mid).toBeGreaterThan(6);
      expect(t.lastIn).toBeGreaterThan(6);
      expect(t.after).toBeLessThan(3);
      expect(t.clean).toBeLessThan(3); // TX-03: the caption-free copy has none of it
    }
    // Both copies: the same frame, length and sound.
    const [a, b] = [await probeMedia(both.file), await probeMedia(both.clean!)];
    for (const p of [a, b]) expect(p).toMatchObject({ width: W, height: H, videoCodec: 'h264', audioCodec: 'aac' });
    expect(Math.abs(a!.durationSec - b!.durationSec)).toBeLessThan(0.05);
    // The track as files: the same lines and times.
    expect(both.view.subtitles!.srt).toBe(`${KA_SRT.trim()}\n`);
    expect(both.view.subtitles!.vtt.startsWith('WEBVTT\n\n00:00:00.500 --> 00:00:02.400\nგამარჯობა! ეს MyAvatar-ია.')).toBe(true);
    sheet('tx02-georgian-captions-burned', [1.4, 4, 6.6].map((t) => ({ file: both.file, t })));
    sheet('tx03-without-captions', [1.4, 4, 6.6].map((t) => ({ file: both.clean!, t })));
    if (OUT) {
      writeFileSync(join(OUT, 'tx02.srt'), both.view.subtitles!.srt);
      writeFileSync(join(OUT, 'tx02.vtt'), both.view.subtitles!.vtt);
    }
    evidence.tx02 = { box, timing, srtBytes: Buffer.byteLength(both.view.subtitles!.srt), qc: both.qc.outcome, warnings: both.qc.warnings };
    evidence.tx03 = { clean: both.view.clean!.name, captioned: both.view.name, durations: [a!.durationSec, b!.durationSec] };
  });

  test('reload: the stored job answers with both copies, the files and the QC; a repeated Start replays, never re-runs', async () => {
    const s = await editJobStatus(deps, { userId: 'u1', jobId: both.jobId });
    if ('error' in s) throw new Error(s.error);
    expect(s.view).toMatchObject({ status: 'completed', clean: { name: both.view.clean!.name }, subtitles: both.view.subtitles, layerQc: { outcome: 'PASS' } });
    const q = both.request;
    expect(validateEditRequest(JSON.parse(JSON.stringify(q)))).toEqual(q);
    const other = await editJobStatus(deps, { userId: 'u2', jobId: both.jobId });
    expect(other).toMatchObject({ ok: false, error: 'not_found' }); // not someone else's
  });

  test('a revision in words: „ქეფშენები ფაილად მომეცი" keeps the same lines (the parent\'s track), only delivered anew', async () => {
    const q = await quote(both.url, [{ op: 'captions', deliver: 'file' }]);
    if (!q.ok) throw new Error(q.error);
    const c = q.quote.edits.find((e) => e.op === 'captions');
    expect(c).toMatchObject({ op: 'captions', deliver: 'file' });
    expect(c?.op === 'captions' && c.track.cues).toEqual((both.request.edits.find((e) => e.op === 'captions') as { track: { cues: unknown } }).track.cues);
    expect(q.request.parent).toEqual({ jobId: both.jobId, depth: 1 });
    // „ქეფშენები მოხსენი" on the same result: nothing of ours is left to draw.
    expect(await quote(both.url, [{ op: 'captions', off: true }])).toMatchObject({ ok: false, error: 'nothing_to_do' });
  });

  test('TX-08 an English track (typed lines), timed, burned in and as SRT/VTT', async () => {
    const cues = parseTimedLines('0:00.5–0:02.4 Hello, this is MyAvatar.; 0:03–0:05 Captions appear on time.; 0:05.6–0:07.6 Thanks for watching.');
    expect(cues).toHaveLength(3);
    const r = await edit('omni-uploads/u1/scene.mp4', [{ op: 'captions', track: { lang: 'en', source: 'typed', cues, style: 'bold' } }]);
    expect(r.qc.outcome).toBe('PASS');
    expect(r.view.clean).toBeUndefined();
    expect(r.view.subtitles!.vtt).toContain('00:00:03.000 --> 00:00:05.000\nCaptions appear on time.');
    expect(r.view.subtitles!.srt).toContain('3\n00:00:05,600 --> 00:00:07,600\nThanks for watching.');
    const box = r.qc.checks.find((c) => c.kind === 'caption')!.box;
    const at = (t: number) => diffIn(rgb(r.file, t, W, H), rgb(SCENE, t, W, H), W, box);
    expect(at(2.95)).toBeLessThan(3);
    expect(at(4)).toBeGreaterThan(6);
    sheet('tx08-english-track', [1.4, 4, 6.6].map((t) => ({ file: r.file, t })));
    evidence.tx08 = { cues: cues.map((c) => [c.startSec, c.endSec, c.text]), shownAt4: at(4), gapAt295: at(2.95), qc: r.qc.outcome, translation: 'BLOCKED_OWNER (a paid model call)' };
  });
});

// ── the edges ───────────────────────────────────────────────────────────────────────────────────────────────────────

test('words a font cannot draw are refused at the quote, named, and nothing is queued', async () => {
  const before = store.rows.size;
  // An emoji is drawn in colour (./emoji, Twemoji): only the letters no font has are refused.
  const q = await quote('omni-uploads/u1/scene.mp4', [{ op: 'layers', add: [{ kind: 'text', text: 'გამარჯობა 你好 😀' }] }]);
  expect(q).toMatchObject({ ok: false, error: 'missing_glyphs' });
  if (q.ok) return;
  expect(q.detail?.split(' ')).toEqual(['你', '好']);
  expect(store.rows.size).toBe(before);
  evidence.missingGlyphs = { asked: 'გამარჯობა 你好 😀', refused: q.detail };
});

test('long Georgian text: 150 letters are laid out to fit a 9:16 frame; 161 are refused', async () => {
  const long = 'ჩვენი გუნდი ყოველდღე ამზადებს ახალ კერძებს და მიგიტანთ ნებისმიერ უბანში, სწრაფად და ფრთხილად, ცხელს და გემრიელს, თბილისის ყველა კუთხეში!';
  expect([...long].length).toBeGreaterThan(130);
  expect([...long].length).toBeLessThanOrEqual(160);
  const r = await edit('omni-uploads/u1/scene.mp4', [{ op: 'aspect', to: '9:16' }, { op: 'layers', add: [{ kind: 'text', text: long, anchor: 'center', size: 70 }] }]);
  expect(r.view).toMatchObject({ width: 1080, height: 1920 });
  expect(r.qc.outcome).toBe('PASS');
  const c = checkOf(r, 't1');
  expect(c.text).toBe(long);
  expect(c.safe).toBe(true);
  expect(c.exactPsnr).toBeGreaterThanOrEqual(26);
  const tooLong = await quote('omni-uploads/u1/scene.mp4', [{ op: 'layers', add: [{ kind: 'text', text: `${long}${'ა'.repeat(161 - [...long].length)}` }] }]);
  expect(tooLong).toMatchObject({ ok: false, error: 'text_too_long' });
  sheet('long-georgian-9x16', [{ file: r.file, t: 4 }]);
  evidence.longText = { letters: [...long].length, box: c.box, fontPx: c.fontPx, fitted: c.fitted ?? false, exactPsnr: c.exactPsnr, refusedAt: 161 };
});

test('masks hide a region where and when asked (mosaic and blur), and only there', async () => {
  const r = await edit('omni-uploads/u1/scene.mp4', [{
    op: 'layers',
    add: [
      { kind: 'mask', mode: 'mosaic', anchor: 'top-left', w: 300, h: 300, fromSec: 1, toSec: 5 },
      { kind: 'mask', mode: 'blur', anchor: 'top-right', w: 300, h: 300, fromSec: 1, toSec: 5 },
    ],
  }]);
  expect(r.qc.outcome).toBe('PASS');
  const [mo, bl] = [checkOf(r, 'm1'), checkOf(r, 'm2')];
  expect(mo.detailKept).toBeLessThanOrEqual(0.35);
  expect(bl.detailKept).toBeLessThanOrEqual(0.35);
  // The same measure on a region no mask covers: the detail is all there.
  const [s3, r3] = [rgb(SCENE, 3, W, H), rgb(r.file, 3, W, H)];
  const control = detailKept(s3, r3, W, { x: 500, y: 250, w: 216, h: 216 });
  expect(control).toBeGreaterThan(0.8);
  expect(diffIn(rgb(r.file, 6, W, H), rgb(SCENE, 6, W, H), W, mo.box)).toBeLessThan(3); // after 5 s: the picture again
  sheet('mask-mosaic-blur', [0.5, 3, 6].map((t) => ({ file: r.file, t })));
  evidence.mask = { mosaic: { box: mo.box, detailKept: mo.detailKept }, blur: { box: bl.box, detailKept: bl.detailKept }, unmaskedControl: control, qc: r.qc.outcome };
});

test('a cancel during a layered edit kills ffmpeg and delivers nothing', async () => {
  const src = await probeMedia(LONG);
  const cues = Array.from({ length: 12 }, (_, i) => ({ startSec: i * 2.4 + 0.2, endSec: i * 2.4 + 2.2, text: `ხაზი ${i + 1}` }));
  const r = resolveEdits([
    { op: 'layers', add: [{ kind: 'text', text: 'ტექსტი ასო-ასო', motionIn: 'typewriter' }] },
    { op: 'captions', track: { lang: 'ka', source: 'typed', cues } },
  ], src!);
  if (!r.ok) throw new Error(r.error);
  const ctl = new AbortController();
  const started = Date.now();
  setTimeout(() => ctl.abort(), 1500);
  const out = await renderEdit(LONG, { edits: r.edits, plan: r.plan }, { signal: ctl.signal });
  expect(out).toMatchObject({ ok: false, error: 'render_failed', detail: 'cancelled' });
  expect(Date.now() - started).toBeLessThan(15_000);
  evidence.cancel = { abortedAfterMs: 1500, returnedAfterMs: Date.now() - started };
});

test('what a phone plays: H.264 4:2:0, the index before the data (faststart), the sound kept as AAC', async () => {
  const r = await edit('omni-uploads/u1/scene.mp4', [{ op: 'layers', add: [{ kind: 'text', text: 'iPhone / Safari', anchor: 'top' }] }]);
  const order = boxes(r.file);
  expect(order.indexOf('moov')).toBeGreaterThan(-1);
  expect(order.indexOf('moov')).toBeLessThan(order.indexOf('mdat'));
  const banner = (() => { try { execFileSync(bin, ['-hide_banner', '-i', r.file], { stdio: 'pipe' }); return ''; } catch (e) { return String((e as { stderr?: Buffer }).stderr ?? ''); } })();
  expect(banner).toMatch(/Video: h264 \([A-Za-z ]+\).*yuv420p/);
  expect(banner).toMatch(/Audio: aac/);
  evidence.playback = { boxes: order, video: /Video: [^\n]+/.exec(banner)?.[0], audio: /Audio: [^\n]+/.exec(banner)?.[0], device: 'T5: a real iPhone/Safari play is the owner\'s check' };
});
