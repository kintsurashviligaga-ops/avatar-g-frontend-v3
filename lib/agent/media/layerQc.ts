/**
 * lib/agent/media/layerQc.ts — the QC of Agent G's layers on the REAL rendered file, before it is delivered. Frames of
 * the result and of the same edit without its layers (the first pass) are decoded at the same instants and compared:
 *
 *   shown     inside a layer's box while it is fully in, the result differs from the base (the layer is there);
 *   exact     that box matches the base with the layer's own drawn PNG laid over it (luma PSNR): the glyphs on screen are
 *             the ones drawn from the exact words, at the planned place (a wrong text, place or font fails);
 *   timing    just before it starts and just after it ends the box equals the base (it is not there);
 *   outside   everywhere outside every box the result equals the base: nothing else in the picture was changed (a
 *             logo printed on the product, the user's own text, faces: all left as they were);
 *   safe      every text box lies inside the frame's safe area (./layers safeArea);
 *   contrast  the measured contrast of each text with the picture behind it (a legibility panel was added under a low one);
 *   hidden    a mask leaves none of the region's own detail (./detailKept).
 *
 * The result is a machine-readable record (LayerQcRecord) stored with the job; a failed `shown`, `exact`, `timing` or
 * `outside` fails the edit (nothing is delivered).
 */
import 'server-only';
import { ffmpegExec } from '@/lib/video/ffmpegExec';
import { inside, overlaps, safeArea, type Rect } from './layers';

/** One frame as packed RGB (w × h × 3), decoded at `atSec` (a still: its only frame). */
export async function grabFrame(bin: string, file: string, atSec: number | null, w: number, h: number): Promise<Buffer> {
  const args = [
    '-hide_banner', '-loglevel', 'error',
    ...(atSec !== null ? ['-ss', String(Math.max(0, Math.round(atSec * 1000) / 1000))] : []),
    '-i', file, '-frames:v', '1', '-vf', `scale=${w}:${h}:flags=neighbor`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ];
  const { stdout } = await ffmpegExec(bin, args, { encoding: 'buffer', maxBuffer: w * h * 3 + 1024, timeout: 60_000 } as never);
  return Buffer.from(stdout as unknown as Buffer);
}

/** A PNG (the drawn layer) as packed RGBA. */
export async function decodeRgba(bin: string, png: string, w: number, h: number): Promise<Buffer> {
  const { stdout } = await ffmpegExec(bin, ['-hide_banner', '-loglevel', 'error', '-i', png, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { encoding: 'buffer', maxBuffer: w * h * 4 + 1024, timeout: 30_000 } as never);
  return Buffer.from(stdout as unknown as Buffer);
}

const inAny = (x: number, y: number, rects: readonly Rect[]): boolean => rects.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);

/** Mean absolute difference (0–255) of two RGB frames inside `rect`. */
export function meanDiff(a: Buffer, b: Buffer, fw: number, rect: Rect): number {
  let sum = 0, n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 1) {
    for (let x = rect.x; x < rect.x + rect.w; x += 1) {
      const i = (y * fw + x) * 3;
      sum += Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!);
      n += 3;
    }
  }
  return n ? sum / n : 0;
}

/** Luma (BT.601) of the pixel at byte offset `i` of a packed RGB frame. */
const lumaAt = (f: Buffer, i: number): number => 0.299 * f[i]! + 0.587 * f[i + 1]! + 0.114 * f[i + 2]!;

/**
 * PSNR (dB) of the LUMA of two RGB frames over `rect` (the whole frame when omitted), leaving out `skip`. 99 =
 * identical. Luma, because the delivered file is 4:2:0 (H.264) or a JPEG: its colour is stored at half resolution by the
 * format itself, so a sharp coloured edge (a red logo) loses some colour even when it is exactly the drawn one; the
 * shape, place and letters are all in the luma.
 */
export function psnr(a: Buffer, b: Buffer, fw: number, fh: number, rect?: Rect, skip: readonly Rect[] = []): number {
  const r = rect ?? { x: 0, y: 0, w: fw, h: fh };
  let se = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y += 1) {
    for (let x = r.x; x < r.x + r.w; x += 1) {
      if (skip.length && inAny(x, y, skip)) continue;
      const i = (y * fw + x) * 3;
      const d = lumaAt(a, i) - lumaAt(b, i);
      se += d * d;
      n += 1;
    }
  }
  if (!n) return 99;
  const mse = se / n;
  return mse < 1e-9 ? 99 : Math.round(10 * Math.log10((255 * 255) / mse) * 10) / 10;
}

/** The base frame with a drawn RGBA layer (`lw`×`lh`) laid at (`lx`, `ly`): what the result must look like there. */
export function composite(base: Buffer, fw: number, layer: Buffer, lw: number, lh: number, lx: number, ly: number): Buffer {
  const out = Buffer.from(base);
  for (let y = 0; y < lh; y += 1) {
    for (let x = 0; x < lw; x += 1) {
      const li = (y * lw + x) * 4;
      const a = layer[li + 3]! / 255;
      if (a === 0) continue;
      const bi = ((ly + y) * fw + (lx + x)) * 3;
      for (let c = 0; c < 3; c += 1) out[bi + c] = Math.round(layer[li + c]! * a + out[bi + c]! * (1 - a));
    }
  }
  return out;
}

/**
 * How much of the base's fine detail is still there in the result, inside `rect` (a mask's region): the correlation of
 * the two frames' luma Laplacians (their edges and texture), 0 = none of it left (blurred away, or replaced by mosaic
 * blocks whose edges are not the picture's), 1 = all of it. Null: the base is flat there (nothing to hide).
 */
export function detailKept(base: Buffer, result: Buffer, fw: number, rect: Rect): number | null {
  const lap = (f: Buffer, x: number, y: number): number => {
    const i = (y * fw + x) * 3;
    return 4 * lumaAt(f, i) - lumaAt(f, i - 3) - lumaAt(f, i + 3) - lumaAt(f, i - fw * 3) - lumaAt(f, i + fw * 3);
  };
  let sab = 0, saa = 0, sbb = 0, n = 0;
  for (let y = rect.y + 1; y < rect.y + rect.h - 1; y += 1) {
    for (let x = rect.x + 1; x < rect.x + rect.w - 1; x += 1) {
      const a = lap(base, x, y), b = lap(result, x, y);
      sab += a * b; saa += a * a; sbb += b * b; n += 1;
    }
  }
  if (!n || saa / n < 16) return null;
  if (sbb === 0) return 0;
  return Math.round(Math.max(0, sab / Math.sqrt(saa * sbb)) * 100) / 100;
}

/** Mean relative luminance (0–1, WCAG) of an RGB frame inside `rect`. */
export function meanLuminance(rgb: Buffer, fw: number, rect: Rect): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  let sum = 0, n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y += 2) {
    for (let x = rect.x; x < rect.x + rect.w; x += 2) {
      const i = (y * fw + x) * 3;
      sum += 0.2126 * lin(rgb[i]!) + 0.7152 * lin(rgb[i + 1]!) + 0.0722 * lin(rgb[i + 2]!);
      n += 1;
    }
  }
  return n ? sum / n : 0;
}

export type QcOutcome = 'PASS' | 'PARTIAL' | 'FAIL';

export interface LayerCheck {
  id: string;
  kind: 'text' | 'image' | 'mask' | 'caption';
  /** The words as drawn (text and caption lines). */
  text?: string;
  box: Rect;
  /** When it was sampled fully in, and the measurements there. */
  atSec: number | null;
  /** A mask: how much of the picture's own detail is left inside it (./detailKept; null: a flat region). */
  detailKept?: number | null;
  shownDiff: number;
  exactPsnr: number | null;
  beforeDiff: number | null;
  afterDiff: number | null;
  safe: boolean;
  contrast: number | null;
  panelAdded: boolean;
  fontPx?: number;
  /** Set smaller than asked to fit. */
  fitted?: boolean;
  ok: boolean;
  problems: string[];
}

export interface LayerQcRecord {
  outcome: QcOutcome;
  checks: LayerCheck[];
  /** PSNR of the result against the base outside every layer box, at each sampled instant (min). */
  outsidePsnr: number;
  /** Boxes of different layers that cover each other while both are shown (stacking decides what is on top). */
  occlusions: Array<[string, string]>;
  problems: string[];
  warnings: string[];
}

/** Below these, the measurement says the layer is not there / not the drawn one / something else changed. */
export const QC_SHOWN_MIN_DIFF = 2;
export const QC_EXACT_MIN_PSNR = 26;
export const QC_ABSENT_MAX_DIFF = 2.5;
export const QC_OUTSIDE_MIN_PSNR = 30;
/** A mask leaves at most this much of the region's detail (./detailKept: 1 = untouched; blur or mosaic measure ≈ 0–0.2). */
export const QC_MASK_MAX_DETAIL = 0.35;

export interface QcSample {
  id: string;
  kind: LayerCheck['kind'];
  text?: string;
  box: Rect;
  startSec: number;
  endSec: number;
  /** Fully in from (after its way in) to (before its way out). */
  shownFrom: number;
  shownTo: number;
  /** The drawn PNG of its final state, to build the expected picture (null: a mask, checked by `shown` only). */
  png: string | null;
  contrast: number | null;
  panelAdded: boolean;
  fontPx?: number;
  fitted?: boolean;
  /** Text-like layers must lie in the safe area (a mask or a logo may cover the edges). */
  needsSafe: boolean;
}

/**
 * Measure every layer of a rendered result against its base. `still` = a picture (one frame, no timing checks).
 * `samples` are in stacking order; a box covered by a layer above it at the sampled instant is checked for `shown` only.
 */
export async function checkLayers(input: {
  bin: string;
  base: string;
  result: string;
  fw: number;
  fh: number;
  durationSec: number;
  still: boolean;
  samples: readonly QcSample[];
}): Promise<LayerQcRecord> {
  const { bin, base, result, fw, fh, still, samples } = input;
  const dur = input.durationSec;
  const frames = new Map<string, Buffer>();
  const frame = async (file: string, t: number | null): Promise<Buffer> => {
    const key = `${file}@${t === null ? 'still' : t.toFixed(3)}`;
    let f = frames.get(key);
    if (!f) {
      f = await grabFrame(bin, file, t, fw, fh);
      frames.set(key, f);
    }
    return f;
  };
  const area = safeArea(fw, fh);
  const checks: LayerCheck[] = [];
  const problems: string[] = [];
  const warnings: string[] = [];
  let outsidePsnr = 99;
  const activeAt = (t: number | null) => samples.filter((s) => t === null || (t >= s.startSec && t < s.endSec));

  for (const [k, s] of samples.entries()) {
    const at = still ? null : Math.round(((s.shownTo > s.shownFrom ? (s.shownFrom + s.shownTo) / 2 : s.endSec - 0.05)) * 1000) / 1000;
    const [b, r] = [await frame(base, at), await frame(result, at)];
    const above = samples.slice(k + 1).filter((o) => (at === null || (at >= o.startSec && at < o.endSec)) && overlaps(o.box, s.box));
    const shownDiff = Math.round(meanDiff(r, b, fw, s.box) * 100) / 100;
    let exactPsnr: number | null = null;
    if (s.png && !above.length) {
      const rgba = await decodeRgba(bin, s.png, s.box.w, s.box.h);
      const expected = composite(b, fw, rgba, s.box.w, s.box.h, s.box.x, s.box.y);
      exactPsnr = psnr(r, expected, fw, fh, s.box);
    }
    const others = (t: number) => samples.filter((o) => o.id !== s.id && t >= o.startSec && t < o.endSec && overlaps(o.box, s.box));
    let beforeDiff: number | null = null, afterDiff: number | null = null;
    if (!still) {
      const tb = Math.round((s.startSec - 0.1) * 1000) / 1000;
      if (tb >= 0.05 && !others(tb).length) beforeDiff = Math.round(meanDiff(await frame(result, tb), await frame(base, tb), fw, s.box) * 100) / 100;
      const ta = Math.round((s.endSec + 0.1) * 1000) / 1000;
      if (ta <= dur - 0.1 && !others(ta).length) afterDiff = Math.round(meanDiff(await frame(result, ta), await frame(base, ta), fw, s.box) * 100) / 100;
    }
    const safe = !s.needsSafe || inside(s.box, area);
    const p: string[] = [];
    let detailKeptV: number | null | undefined;
    if (s.kind === 'mask') {
      // A mask hides detail: how much of the base's own detail is left inside it. A flat area has nothing to hide.
      detailKeptV = detailKept(b, r, fw, s.box);
      if (detailKeptV !== null && detailKeptV > QC_MASK_MAX_DETAIL) p.push(`${s.id}: the region is not hidden (${detailKeptV} of its detail left)`);
    } else if (!(shownDiff >= QC_SHOWN_MIN_DIFF)) p.push(`${s.id}: not visible at ${at ?? 'the picture'} (diff ${shownDiff})`);
    if (exactPsnr !== null && exactPsnr < QC_EXACT_MIN_PSNR) p.push(`${s.id}: not the drawn layer at its place (PSNR ${exactPsnr} dB)`);
    if (beforeDiff !== null && beforeDiff > QC_ABSENT_MAX_DIFF) p.push(`${s.id}: visible before ${s.startSec} s (diff ${beforeDiff})`);
    if (afterDiff !== null && afterDiff > QC_ABSENT_MAX_DIFF) p.push(`${s.id}: visible after ${s.endSec} s (diff ${afterDiff})`);
    if (!safe) p.push(`${s.id}: outside the safe area`);
    problems.push(...p);
    checks.push({
      id: s.id, kind: s.kind, ...(s.text !== undefined ? { text: s.text } : {}), box: s.box, atSec: at, ...(detailKeptV !== undefined ? { detailKept: detailKeptV } : {}), shownDiff, exactPsnr,
      beforeDiff, afterDiff, safe, contrast: s.contrast, panelAdded: s.panelAdded,
      ...(s.fontPx !== undefined ? { fontPx: s.fontPx } : {}), ...(s.fitted ? { fitted: true } : {}), ok: p.length === 0, problems: p,
    });
    // Nothing outside the boxes shown at this instant changed.
    const boxes = activeAt(at).map((o) => o.box);
    outsidePsnr = Math.min(outsidePsnr, psnr(r, b, fw, fh, undefined, boxes));
  }
  if (outsidePsnr < QC_OUTSIDE_MIN_PSNR) problems.push(`the picture outside the layers changed (PSNR ${outsidePsnr} dB)`);

  const occlusions: Array<[string, string]> = [];
  for (let i = 0; i < samples.length; i += 1) {
    for (let j = i + 1; j < samples.length; j += 1) {
      const a = samples[i]!, b = samples[j]!;
      if (a.kind === 'caption' && b.kind === 'caption') continue;
      const together = still || (a.startSec < b.endSec && b.startSec < a.endSec);
      if (together && overlaps(a.box, b.box)) occlusions.push([a.id, b.id]);
    }
  }
  if (occlusions.length) warnings.push(`layers cover each other: ${occlusions.map((o) => o.join('/')).join(', ')}`);
  for (const c of checks) if (c.panelAdded) warnings.push(`${c.id}: low contrast (${c.contrast}:1), a panel was added`);
  for (const c of checks) if (c.fitted) warnings.push(`${c.id}: set smaller to fit (${c.fontPx}px)`);
  // Warnings are notes (a panel added for legibility, stacking chosen by z): they do not lower the outcome. What could
  // not be measured is the caller's to mark PARTIAL (beats not found, a transcript's own timing).
  const outcome: QcOutcome = problems.length ? 'FAIL' : 'PASS';
  return { outcome, checks, outsidePsnr, occlusions, problems, warnings };
}
