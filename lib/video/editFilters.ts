/**
 * lib/video/editFilters.ts — the ffmpeg filter text of the deterministic video edits, in ONE place: the remix route's
 * request-scoped ops (lib/video/remixOps) and Agent G's queued edit (lib/agent/media/editPlan) build the same picture
 * from the same words. Pure strings, no ffmpeg and no I/O, so both sides and their tests import it anywhere.
 */

export type FrameAspect = '9:16' | '16:9' | '1:1' | '4:5';

/** The canvas each frame shape is rendered at (the multi-clip filtergraph's CANVAS uses the same sizes). */
export const ASPECT_DIMS: Readonly<Record<FrameAspect, readonly [number, number]>> = {
  '9:16': [1080, 1920],
  '16:9': [1920, 1080],
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
};

export type GradeStyle = 'vintage' | 'cinematic' | 'neon' | 'noir' | 'dramatic';

/**
 * Per-style colour grades. `cinematic` is teal and orange (cool shadows, GENTLY warm highlights).
 * V8-F3 PARITY: the highlight warm push matches the master cinematic LUT (lib/orchestrator/cinematic-lut.ts). A larger
 * rh / bh brings back the warm-highlight yellow tint the LUT fix removed; change both together or neither.
 */
export const GRADE_VF: Readonly<Record<GradeStyle, string>> = {
  vintage: 'curves=vintage',
  cinematic: 'colorbalance=rs=-0.08:bs=0.08:rh=0.02:bh=-0.02,eq=contrast=1.08:saturation=1.06,vignette=PI/5',
  neon: 'hue=s=2,eq=contrast=1.2:brightness=0.1',
  noir: 'hue=s=0,eq=contrast=1.25:brightness=-0.02,vignette=PI/4',
  dramatic: 'eq=contrast=1.2:saturation=0.96,vignette=PI/4',
};

/** Speed limits both executors accept. */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

/** `atempo` takes 0.5–2 per stage: a factor outside that is a product of in-range stages. */
export function atempoChain(factor: number): string {
  const f = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Number(factor) || 1));
  const steps: number[] = [];
  let rest = f;
  while (rest > 2) { steps.push(2); rest /= 2; }
  while (rest < 0.5) { steps.push(0.5); rest /= 0.5; }
  steps.push(rest);
  return steps.map((s) => `atempo=${s.toFixed(4)}`).join(',');
}

/** The picture at `factor` times its speed. */
export const setptsFor = (factor: number): string =>
  `setpts=${(1 / Math.max(MIN_SPEED, Math.min(MAX_SPEED, Number(factor) || 1))).toFixed(4)}*PTS`;

/**
 * A new frame shape. `crop` fills the frame (scaled to cover, the overflow cut: edges may be lost); `pad` keeps the
 * whole picture (scaled to fit, black bars). Both end at the shape's exact canvas, square pixels, yuv420p.
 */
export function aspectVf(aspect: FrameAspect, fit: 'crop' | 'pad'): string {
  const [w, h] = ASPECT_DIMS[aspect];
  return fit === 'crop'
    ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,format=yuv420p`
    : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=yuv420p`;
}
