/**
 * lib/video/frameChain.ts — continuous scenes: every clip ends exactly where the next one begins.
 *
 * Scenes rendered independently each drift on their own (framing, light, pose, background), so every cut jumps.
 * Veo 3.1 can interpolate between a first and a LAST frame; giving clip i the next scene's first frame as its last
 * frame makes each join a match cut. Google's interpolation renders 8 s clips, so other clip lengths stay unchained.
 */

/** Frame chaining is on for 8 s clips when every scene has a first frame, unless FILM_FRAME_CHAIN=0. */
export function filmFrameChainOn(clipSec: number, frames: readonly (string | null | undefined)[]): boolean {
  if (/^(0|false|off)$/i.test((process.env.FILM_FRAME_CHAIN || '').trim())) return false;
  return clipSec === 8 && frames.length >= 2 && frames.every((f) => typeof f === 'string' && f.length > 0);
}

/**
 * The last frame for clip `i`: the next scene's first frame. Null for the final clip, and when the next frame is the
 * same image (one anchor reused for every scene) — interpolating back to its own start would make the clip a loop.
 */
export function chainEndFrame(frames: readonly (string | null | undefined)[], i: number): string | null {
  const next = frames[i + 1];
  return typeof next === 'string' && next && next !== frames[i] ? next : null;
}
