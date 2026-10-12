/**
 * lib/agent/media/overlayFx.ts — the overlay of Agent G's edit („დაადე ოვერლეი", "add an overlay"): one effect over the
 * whole picture, FFmpeg only (no asset, no model, free like the rest of the edit), deterministic (a fixed seed: the same
 * edit makes the same frames).
 *
 *   light-leak  warm light (orange to gold) drifting slowly over the frame, screen-blended at 40 %: the film look an
 *               editor's „overlay" means. ffmpeg's `gradients` source, drawn at a quarter size and scaled up (it is
 *               soft anyway, and four times cheaper), blended in RGB (screen is an RGB operation).
 *   grain       film grain, moving each frame.
 *
 * Its own pass between the edit's first pass and the layers (./editLive): the text drawn later sits ON the overlay and
 * the layers' QC compares against the overlaid picture. The overlay's own QC (overlayQc) measures, on the rendered
 * file, that it is there (the frame differs from the picture without it) and that the picture is kept (the luma of the
 * two still correlates): an overlay that drowned the video, or did nothing, is not delivered.
 */
import type { OverlayLook } from './editPlan';

const s3 = (n: number): string => String(Math.max(0, Math.round(n * 1000) / 1000));

/** The light leak's look: its colours, how fast it drifts, how strongly it is laid on. */
export const LIGHT_LEAK = { colors: ['0xff8a2a', '0xffd36a', '0x000000'], speed: 0.02, opacity: 0.4, seed: 7 } as const;
export const GRAIN_STRENGTH = 12;

export interface OverlayOpts {
  look: OverlayLook;
  /** The frame (even sides) and the length of the video it goes over. */
  width: number;
  height: number;
  durationSec: number;
  /** The edit's fades: the overlay fades with the picture, so a fade to black stays black. */
  fade?: { inSec: number; outSec: number };
}

/** The filtergraph of the overlay pass: input 0 is the video, input 1 (light leak only) the generated light. */
export function overlayGraph(o: OverlayOpts): { lavfi: string | null; graph: string } {
  if (o.look === 'grain') {
    return { lavfi: null, graph: `[0:v]noise=alls=${GRAIN_STRENGTH}:allf=t+u,format=yuv420p[vout]` };
  }
  const qw = Math.max(16, Math.round(o.width / 4)), qh = Math.max(16, Math.round(o.height / 4));
  const [c0, c1, c2] = LIGHT_LEAK.colors;
  const lavfi = `gradients=s=${qw}x${qh}:r=30:d=${s3(o.durationSec + 1)}:n=3:c0=${c0}:c1=${c1}:c2=${c2}`
    + `:x0=0:y0=0:x1=${qw}:y1=${qh}:speed=${LIGHT_LEAK.speed}:type=radial:seed=${LIGHT_LEAK.seed}`;
  const fades: string[] = [];
  if (o.fade && o.fade.inSec > 0) fades.push(`fade=t=in:st=0:d=${s3(o.fade.inSec)}`);
  if (o.fade && o.fade.outSec > 0) fades.push(`fade=t=out:st=${s3(Math.max(0, o.durationSec - o.fade.outSec))}:d=${s3(o.fade.outSec)}`);
  const light = [`scale=${o.width}:${o.height}:flags=bicubic`, ...fades, 'format=gbrp'].join(',');
  return {
    lavfi,
    graph: `[1:v]${light}[leak];[0:v]format=gbrp[base];[base][leak]blend=all_mode=screen:all_opacity=${LIGHT_LEAK.opacity}:shortest=1,format=yuv420p[vout]`,
  };
}

const X264 = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p'];

/** The overlay pass: `base` (the first pass's output) → `out`, its sound copied as it is. */
export function overlayArgs(base: string, out: string, o: OverlayOpts): string[] {
  const g = overlayGraph(o);
  return [
    '-hide_banner', '-y', '-i', base, ...(g.lavfi ? ['-f', 'lavfi', '-i', g.lavfi] : []),
    '-filter_complex', g.graph, '-map', '[vout]', '-map', '0:a?',
    ...X264, '-c:a', 'copy', '-t', s3(o.durationSec), '-movflags', '+faststart', '-f', 'mp4', out,
  ];
}

/** The instants the overlay is measured at: a quarter, the half, three quarters (the light drifts: several looks). */
export const overlayCheckPoints = (durationSec: number): number[] => [0.25, 0.5, 0.75].map((k) => Math.round(durationSec * k * 100) / 100);

/** Luma correlation (Pearson) of two packed RGB frames of the same size: 1 = the same picture, 0 = unrelated. */
export function lumaCorrelation(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length) / 3;
  if (n < 2) return 0;
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < n * 3; i += 3) {
    const x = 0.299 * a[i]! + 0.587 * a[i + 1]! + 0.114 * a[i + 2]!;
    const y = 0.299 * b[i]! + 0.587 * b[i + 1]! + 0.114 * b[i + 2]!;
    sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  if (va <= 1e-6 || vb <= 1e-6) return va <= 1e-6 && vb <= 1e-6 ? 1 : 0;
  return cov / Math.sqrt(va * vb);
}

/** How much a packed RGB frame's luma varies (its standard deviation, 0–255): near 0 for a black or plain frame. */
export function lumaSpread(a: Buffer): number {
  const n = Math.floor(a.length / 3);
  if (n < 2) return 0;
  let s = 0, ss = 0;
  for (let i = 0; i < n * 3; i += 3) {
    const x = 0.299 * a[i]! + 0.587 * a[i + 1]! + 0.114 * a[i + 2]!;
    s += x; ss += x * x;
  }
  return Math.sqrt(Math.max(0, ss / n - (s / n) ** 2));
}

/** Mean absolute difference (0–255) of two packed RGB frames. */
export function frameDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += Math.abs(a[i]! - b[i]!);
  return sum / n;
}

/** An overlay is there when a frame differs by at least this much on average… */
export const OVERLAY_MIN_DIFF = { 'light-leak': 3, grain: 1.5 } as const;
/** …and the picture under it is kept when the luma still correlates at least this much. */
export const OVERLAY_MIN_CORR = 0.8;
/**
 * A frame whose luma varies less than this (black, a plain wall, a clear sky) has no picture to correlate with: the
 * light over it is all the structure there is, so its correlation says nothing about the picture being kept. Such an
 * instant still counts for the overlay showing; it is left out of the picture-kept check only.
 */
export const OVERLAY_FLAT_SPREAD = 4;

export interface OverlayQcRecord {
  outcome: 'PASS' | 'FAIL';
  look: OverlayLook;
  /** `flat`: the frame without the overlay had no picture to keep (OVERLAY_FLAT_SPREAD). */
  samples: Array<{ atSec: number; diff: number; corr: number; flat?: true }>;
  problems: string[];
}

/** The verdict on the measured samples (frames of the video without and with the overlay, at the same instants). */
export function overlayVerdict(look: OverlayLook, samples: OverlayQcRecord['samples']): OverlayQcRecord {
  const problems: string[] = [];
  if (!samples.length) problems.push('no frame could be measured');
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const shown = samples.filter((s) => s.diff >= OVERLAY_MIN_DIFF[look]).length;
  // The light drifts: it must show on most of the instants measured, and never drown the picture.
  if (samples.length && shown < Math.ceil(samples.length / 2)) problems.push(`the overlay is not visible (diff ${samples.map((s) => r2(s.diff)).join(', ')})`);
  const lost = samples.filter((s) => !s.flat && s.corr < OVERLAY_MIN_CORR);
  if (lost.length) problems.push(`the picture is lost under the overlay at ${lost.map((s) => `${s.atSec}s (corr ${r2(s.corr)})`).join(', ')}`);
  return { outcome: problems.length ? 'FAIL' : 'PASS', look, samples: samples.map((s) => ({ atSec: s.atSec, diff: r2(s.diff), corr: Math.round(s.corr * 1000) / 1000, ...(s.flat ? { flat: true as const } : {}) })), problems };
}
