/**
 * Decide whether a finished clip still has to be conformed to the requested shape.
 *
 * ⚠️ THE BUG. /api/video/assemble carefully resolves the output orientation — including the
 * `aspect:"9:16"` / `format:"9:16"` aliases, because those were once dropped and a vertical request
 * rendered 16:9 — and then the SINGLE-CLIP path never uses it. That path starts with
 * `let master = clipUrl` and only ever mux/dubs/overlays/captions on top; the canvas dimensions live in
 * `buildFilterComplex`, which only the ≥2-segment stitch goes through.
 *
 * So an 8-second film — one of the three lengths the composer offers, and the only one that produces a
 * single clip — came back in whatever shape the provider happened to return. This is not a rare corner:
 * 'vertical' is the composer's DEFAULT orientation, Veo only emits 16:9 and 9:16 (so 1:1 and 4:5 can
 * never come back native), and Kling ignores `aspect_ratio` outright whenever a start image is supplied.
 * The multi-clip path handles all of that; the single-clip path silently did not.
 *
 * Conforming unconditionally would be wasteful and lossy — a re-encode for nothing whenever the provider
 * already returned the right shape — so the decision is made from the probed dimensions and kept pure
 * and testable here, separately from the ffmpeg that acts on it.
 */

export type Orientation = 'landscape' | 'vertical' | 'square' | 'portrait';

/** Canonical target per orientation. Mirrors the assembler's canvas table exactly. */
export const ORIENTATION_DIMS: Record<Orientation, readonly [number, number]> = {
  landscape: [1920, 1080],
  vertical: [1080, 1920],
  square: [1080, 1080],
  portrait: [1080, 1350],
};

/** The aspect string `fitAspect` takes, per orientation. */
export const ORIENTATION_ASPECT: Record<Orientation, '16:9' | '9:16' | '1:1' | '4:5'> = {
  landscape: '16:9',
  vertical: '9:16',
  square: '1:1',
  portrait: '4:5',
};

/**
 * True when the clip's ratio differs enough from the target to be worth a re-encode.
 *
 * The tolerance is deliberate: a provider returning 1920×1088 (a common macroblock-aligned height) is
 * 1.765 against a target of 1.778 — visually identical, and re-encoding it would cost a generation of
 * quality to correct nothing. Anything a viewer would actually see as the wrong shape is far outside 2%.
 *
 * Unknown dimensions (a failed probe) return FALSE: without a measurement we cannot claim the clip is
 * wrong, and conforming on a guess would mangle correct output. The multi-clip path is the safety net
 * for everything else.
 */
export function needsAspectConform(
  dims: { w: number; h: number } | null | undefined,
  orientation: Orientation,
  tolerance = 0.02,
): boolean {
  const w = dims?.w ?? 0;
  const h = dims?.h ?? 0;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return false;
  const [tw, th] = ORIENTATION_DIMS[orientation];
  const target = tw / th;
  const actual = w / h;
  return Math.abs(actual - target) / target > tolerance;
}
