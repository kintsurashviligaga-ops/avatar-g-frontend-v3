/**
 * lib/video/clipLook.ts — shot matching: bring every clip of a film to one exposure and one colour intensity.
 *
 * WHY THIS EXISTS. Each Veo clip is a separate generation and picks its own exposure and saturation. The
 * assembler then applied the SAME grade to every clip, which keeps the differences: in the 2026-10-16 ad one
 * scene came out vivid and the next one dull, so the colour visibly jumped at the cut. A colourist's first pass
 * on any multi-camera edit is shot matching — every shot is corrected toward one reference before the look is
 * applied. This module is that pass, measured: the caller samples each clip's average luma (YAVG) and chroma
 * (SATAVG) with ffmpeg's signalstats, and gets back one gentle per-clip correction toward the film's median.
 *
 * The corrections are clamped small on purpose: a clip that differs a lot is a different SHOT (night vs day),
 * not a mistake, and must not be flattened into its neighbour.
 */

export interface ClipStats {
  /** Average luma, 8-bit (signalstats YAVG). */
  yavg: number;
  /** Average chroma magnitude, 8-bit (signalstats SATAVG). */
  satavg: number;
}

export interface ClipLook {
  /** eq brightness offset (-1…1 scale), applied before the shared grade. */
  brightness: number;
  /** eq saturation multiplier (1 = unchanged). */
  saturation: number;
}

/** Largest exposure correction (eq units ≈ 15 of 255 luma levels). */
export const MAX_BRIGHTNESS_SHIFT = 0.06;
/** Saturation multiplier bounds. */
export const MIN_SAT_RATIO = 0.85;
export const MAX_SAT_RATIO = 1.18;
/** Below this a difference is invisible; leave the clip alone. */
const BRIGHTNESS_DEADBAND = 0.008;
const SAT_DEADBAND = 0.02;

/** Average YAVG / SATAVG from `metadata=print` output of a signalstats pass. Null when nothing was measured. */
export function parseSignalStats(log: string): ClipStats | null {
  const avg = (key: string): number | null => {
    const rx = new RegExp(`lavfi\\.signalstats\\.${key}=([0-9.]+)`, 'g');
    const vals: number[] = [];
    for (const m of String(log || '').matchAll(rx)) {
      const v = Number(m[1]);
      if (Number.isFinite(v)) vals.push(v);
    }
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const yavg = avg('YAVG');
  const satavg = avg('SATAVG');
  return yavg === null || satavg === null ? null : { yavg, satavg };
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * One correction per clip toward the film's median exposure and saturation. A clip that could not be measured
 * (null) gets null (no correction). Fewer than two measured clips → nothing to match, every entry null.
 */
export function matchClipLooks(stats: readonly (ClipStats | null)[]): (ClipLook | null)[] {
  const measured = stats.filter((s): s is ClipStats => !!s && s.satavg > 0);
  if (measured.length < 2) return stats.map(() => null);
  const targetY = median(measured.map((s) => s.yavg));
  const targetSat = median(measured.map((s) => s.satavg));
  return stats.map((s) => {
    if (!s || s.satavg <= 0) return null;
    let brightness = clamp((targetY - s.yavg) / 255, -MAX_BRIGHTNESS_SHIFT, MAX_BRIGHTNESS_SHIFT);
    let saturation = clamp(targetSat / s.satavg, MIN_SAT_RATIO, MAX_SAT_RATIO);
    if (Math.abs(brightness) < BRIGHTNESS_DEADBAND) brightness = 0;
    if (Math.abs(saturation - 1) < SAT_DEADBAND) saturation = 1;
    return brightness === 0 && saturation === 1 ? null : { brightness: round3(brightness), saturation: round3(saturation) };
  });
}
