/**
 * The culling assistant's measurements — sharpness, exposure clipping, a perceptual hash and burst grouping — as
 * pure functions over RGBA pixels. No DOM, no I/O, no network: the culling worker
 * (components/studio/photo/cull.worker.ts) decodes a photo on the user's device and hands the pixels here, and the
 * main-thread fallback calls the very same functions. Photos never leave the device, so nothing in this file may
 * ever learn to upload one.
 *
 * Every number is measured on the ANALYSIS copy (long edge ANALYSIS_LONG_EDGE), never the original: a Laplacian's
 * variance depends on resolution, so the thresholds below only mean something at one fixed size.
 */

/** RGBA, 4 bytes per pixel (ImageData.data, or any byte buffer laid out the same way). */
export type Rgba = Uint8ClampedArray | Uint8Array;

/** The long edge photos are scaled to before they are measured. The thresholds below are calibrated at it. */
export const ANALYSIS_LONG_EDGE = 1024;

/** Sharpness below this (Laplacian variance of the sharpest tiles, 0–255 luma) is flagged „blurry". */
export const SHARPNESS_FLAG_BELOW = 80;
/** A burst frame this much softer than the burst's sharpest one is flagged „softer than its burst". */
export const BURST_SOFTER_RATIO = 0.6;
/** A pixel whose brightest channel is at or above this is clipped highlight. */
export const HIGHLIGHT_LEVEL = 250;
/** A pixel whose brightest channel is at or below this is crushed shadow. */
export const SHADOW_LEVEL = 5;
/** More than this share of the frame clipped → „highlights blown". */
export const HIGHLIGHT_FLAG_ABOVE = 0.05;
/** More than this share of the frame crushed, or a mean luma under DARK_MEAN_BELOW → „underexposed". */
export const SHADOW_FLAG_ABOVE = 0.25;
export const DARK_MEAN_BELOW = 0.12;
/** Two neighbouring frames whose dHashes differ in at most this many of 64 bits show the same scene. */
export const BURST_MAX_HAMMING = 10;
/** …and, when both carry a capture time, were taken at most this far apart. */
export const BURST_MAX_GAP_MS = 5_000;

/** Fits `w × h` inside a square of `longEdge`, never upscaling. */
export function fitWithin(w: number, h: number, longEdge: number): { w: number; h: number } {
  const W = Math.max(1, Math.floor(w));
  const H = Math.max(1, Math.floor(h));
  const s = Math.min(1, longEdge / Math.max(W, H));
  return { w: Math.max(1, Math.round(W * s)), h: Math.max(1, Math.round(H * s)) };
}

/** Rec. 709 luma per pixel, 0–255 (alpha ignored). */
export function lumaOf(rgba: Rgba, width: number, height: number): Float32Array {
  const n = width * height;
  const out = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    out[i] = 0.2126 * rgba[p]! + 0.7152 * rgba[p + 1]! + 0.0722 * rgba[p + 2]!;
  }
  return out;
}

export interface Sharpness {
  /** Mean Laplacian variance of the sharpest tenth of the tiles — what the flag reads. */
  score: number;
  /** The whole frame's Laplacian variance, for reference. */
  global: number;
}

/**
 * Tiled Laplacian variance.
 *
 * ⚠️ TILED, NOT GLOBAL. One variance over the whole frame calls every shallow-depth-of-field portrait blurry: the
 * bokeh is most of the picture. A frame is as sharp as its sharpest region, so the frame is cut into a GRID × GRID
 * grid and scored by the mean of its sharpest tiles. (High-ISO noise also reads as detail; the downscale to the
 * analysis size averages most of it away.)
 */
export function laplacianSharpness(luma: Float32Array, width: number, height: number, grid = 6): Sharpness {
  if (width < 3 || height < 3) return { score: 0, global: 0 };
  const g = Math.max(1, Math.min(grid, Math.floor(Math.min(width, height) / 3)));
  const tiles = g * g;
  const sum = new Float64Array(tiles);
  const sq = new Float64Array(tiles);
  const cnt = new Uint32Array(tiles);
  let gSum = 0;
  let gSq = 0;
  let gCnt = 0;
  for (let y = 1; y < height - 1; y++) {
    const ty = Math.min(g - 1, Math.floor((y * g) / height));
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = row + x;
      const lap = luma[i - 1]! + luma[i + 1]! + luma[i - width]! + luma[i + width]! - 4 * luma[i]!;
      const t = ty * g + Math.min(g - 1, Math.floor((x * g) / width));
      sum[t]! += lap;
      sq[t]! += lap * lap;
      cnt[t]! += 1;
      gSum += lap;
      gSq += lap * lap;
      gCnt += 1;
    }
  }
  const variances: number[] = [];
  for (let t = 0; t < tiles; t++) {
    const c = cnt[t]!;
    if (c < 2) continue;
    const m = sum[t]! / c;
    variances.push(Math.max(0, sq[t]! / c - m * m));
  }
  variances.sort((a, b) => b - a);
  const top = Math.max(1, Math.round(variances.length * 0.1));
  let s = 0;
  for (let k = 0; k < top && k < variances.length; k++) s += variances[k]!;
  const gm = gCnt ? gSum / gCnt : 0;
  return { score: variances.length ? s / Math.min(top, variances.length) : 0, global: gCnt ? Math.max(0, gSq / gCnt - gm * gm) : 0 };
}

export interface Exposure {
  /** Mean luma, 0–1. */
  meanLuma: number;
  /** Share of pixels whose brightest channel is clipped (≥ HIGHLIGHT_LEVEL), 0–1. */
  highlightClip: number;
  /** Share of pixels whose brightest channel is crushed (≤ SHADOW_LEVEL), 0–1. */
  shadowClip: number;
}

/**
 * Exposure and clipping. A pixel counts as clipped when ANY channel is — a red sky blown in the red channel has lost
 * detail even when its luma looks fine — and as crushed only when ALL of them are (its brightest one is).
 */
export function exposureStats(rgba: Rgba, width: number, height: number): Exposure {
  const n = width * height;
  if (n <= 0) return { meanLuma: 0, highlightClip: 0, shadowClip: 0 };
  let lumaSum = 0;
  let hi = 0;
  let lo = 0;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = rgba[p]!;
    const g = rgba[p + 1]!;
    const b = rgba[p + 2]!;
    lumaSum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (max >= HIGHLIGHT_LEVEL) hi++;
    else if (max <= SHADOW_LEVEL) lo++;
  }
  return { meanLuma: lumaSum / n / 255, highlightClip: hi / n, shadowClip: lo / n };
}

/**
 * dHash — 64 bits, as 16 hex characters: the luma is averaged into a 9 × 8 grid and each bit says whether a cell is
 * brighter than its right-hand neighbour. Survives rescaling, recompression and a frame's small shifts; a different
 * scene lands about 32 bits away. Hex rather than a BigInt so it survives postMessage, JSON and React state alike.
 */
export function dHash(luma: Float32Array, width: number, height: number): string {
  const cols = 9;
  const rows = 8;
  const cells = new Float64Array(cols * rows);
  if (width <= 0 || height <= 0) return '0'.repeat(16);
  for (let r = 0; r < rows; r++) {
    const y0 = Math.floor((r * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * height) / rows));
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * width) / cols));
      let s = 0;
      let k = 0;
      for (let y = y0; y < y1 && y < height; y++) {
        for (let x = x0; x < x1 && x < width; x++) { s += luma[y * width + x]!; k++; }
      }
      cells[r * cols + c] = k ? s / k : 0;
    }
  }
  let hex = '';
  for (let r = 0; r < rows; r++) {
    let byte = 0;
    for (let c = 0; c < cols - 1; c++) {
      byte = (byte << 1) | (cells[r * cols + c]! > cells[r * cols + c + 1]! ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

const HEX16 = /^[0-9a-f]{16}$/;

function popcount32(v: number): number {
  let x = v - ((v >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Bits that differ between two dHashes (0–64). Anything that is not a dHash is maximally far (64). */
export function hamming(a: string, b: string): number {
  if (!HEX16.test(a) || !HEX16.test(b)) return 64;
  const hi = (parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0;
  const lo = (parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0;
  return popcount32(hi) + popcount32(lo);
}

export interface PhotoMetrics {
  sharpness: number;
  sharpnessGlobal: number;
  meanLuma: number;
  highlightClip: number;
  shadowClip: number;
  hash: string;
}

/** Everything the culling assistant measures, from one analysis-size RGBA frame. */
export function analyzePixels(rgba: Rgba, width: number, height: number): PhotoMetrics {
  const luma = lumaOf(rgba, width, height);
  const sharp = laplacianSharpness(luma, width, height);
  const exp = exposureStats(rgba, width, height);
  return {
    sharpness: sharp.score,
    sharpnessGlobal: sharp.global,
    meanLuma: exp.meanLuma,
    highlightClip: exp.highlightClip,
    shadowClip: exp.shadowClip,
    hash: dHash(luma, width, height),
  };
}

// ── Bursts ────────────────────────────────────────────────────────────────────────────────────────────────────

export interface BurstInput {
  id: string;
  /** null until the photo is analysed (or when it could not be) — such a photo ends any burst it sits in. */
  hash: string | null;
  /** Capture time in ms (EXIF), or null when the file carries none. */
  takenAt: number | null;
  sharpness: number | null;
}

export interface BurstInfo {
  /** The id of the burst's first frame. */
  burstId: string;
  size: number;
  /** 0-based position inside the burst. */
  index: number;
  /** The sharpest frame of a burst of two or more — a suggestion, never a selection. */
  best: boolean;
  bestSharpness: number;
}

/**
 * Groups neighbouring frames (in the order given — the grid's order) that show the same scene: each frame is
 * compared with the one before it, so a burst that pans slowly still chains. When both frames carry a capture time
 * they must also be close in time, which keeps two separate visits to the same view apart.
 */
export function groupBursts(
  items: readonly BurstInput[],
  opts: { maxHamming?: number; maxGapMs?: number } = {},
): Map<string, BurstInfo> {
  const maxHamming = opts.maxHamming ?? BURST_MAX_HAMMING;
  const maxGapMs = opts.maxGapMs ?? BURST_MAX_GAP_MS;
  const out = new Map<string, BurstInfo>();
  const close = (run: readonly BurstInput[]) => {
    if (!run.length) return;
    let bestAt = 0;
    let best = -Infinity;
    run.forEach((it, i) => { const s = it.sharpness ?? -Infinity; if (s > best) { best = s; bestAt = i; } });
    const burstId = run[0]!.id;
    run.forEach((it, i) => out.set(it.id, {
      burstId, size: run.length, index: i, best: run.length > 1 && i === bestAt, bestSharpness: Number.isFinite(best) ? best : 0,
    }));
  };
  let run: BurstInput[] = [];
  for (const it of items) {
    const prev = run[run.length - 1];
    const linked = !!prev && prev.hash !== null && it.hash !== null && hamming(prev.hash, it.hash) <= maxHamming
      && (prev.takenAt === null || it.takenAt === null || Math.abs(it.takenAt - prev.takenAt) <= maxGapMs);
    if (linked) run.push(it);
    else { close(run); run = [it]; }
  }
  close(run);
  return out;
}

// ── Verdict ───────────────────────────────────────────────────────────────────────────────────────────────────

export type CullFlag = 'blurry' | 'burst-softer' | 'highlights' | 'underexposed';

export interface CullVerdict {
  flags: CullFlag[];
  /** 'review' when anything is flagged. There is no 'reject' — see below. */
  advice: 'ok' | 'review';
}

/**
 * What the assistant would point out about a frame.
 *
 * ⚠️ IT FLAGS, IT NEVER REJECTS. The verdict has no reject value and nothing turns one into a status: a blurry frame
 * may be the only frame of the moment, motion blur may be the intent, a blown sky may be the look. Pick / reject /
 * unrated (P · X · U) are the photographer's alone; the assistant only says where to look.
 */
export function verdict(m: PhotoMetrics, burst?: BurstInfo | null): CullVerdict {
  const flags: CullFlag[] = [];
  if (m.sharpness < SHARPNESS_FLAG_BELOW) flags.push('blurry');
  else if (burst && burst.size > 1 && !burst.best && m.sharpness < burst.bestSharpness * BURST_SOFTER_RATIO) flags.push('burst-softer');
  if (m.highlightClip > HIGHLIGHT_FLAG_ABOVE) flags.push('highlights');
  if (m.shadowClip > SHADOW_FLAG_ABOVE || m.meanLuma < DARK_MEAN_BELOW) flags.push('underexposed');
  return { flags, advice: flags.length ? 'review' : 'ok' };
}
