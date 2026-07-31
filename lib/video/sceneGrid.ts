/**
 * How many scenes a film of a given length is made of — in ONE place.
 *
 * ⚠️ THIS RULE EXISTED SIX TIMES IN OmniStudio.tsx, and not all six agreed:
 *
 *   line 1805  videoDuration <= 8 ? 1 : Math.min(6, Math.round(videoDuration / 8))
 *   line 2431  … ? 1 : Math.max(2, Math.min(6, Math.round(… / 8)))
 *   line 2538  … ? 1 : Math.max(2, Math.min(6, Math.round(… / 8)))
 *   line 3037  … ? 1 : Math.max(2, Math.min(6, Math.round(… / 8)))
 *   line 7866  … ? 1 : Math.max(2, Math.min(6, Math.round(… / 8)))
 *   line 3517  Math.max(1, Math.min(6, Math.round(imgBoardDuration / 8)))
 *
 * The one at 1805 sizes the scene-frame upload slots and the one at 7866 RENDERS them, and they use
 * different floors. For the three durations the UI actually offers (8 / 24 / 48) every variant happens
 * to agree, so nothing is broken today — but the count decides how many anchor frames the user uploads,
 * how many scene prompts are kept, how many scenes the storyboard plans, and how many clips are billed.
 * Six hand-copies of an arithmetic rule that MUST agree, differing in their clamps, is a bug that has
 * not happened yet. Adding a fourth duration option would have been enough to trigger it.
 *
 * Deliberately separate from the pipeline's `planSegmentCount`, which clamps to MAX_SEGMENTS = 12: that
 * is the SERVER's ceiling for a script-driven breakdown, while this is the ceiling on what the composer
 * offers. They are different limits and collapsing them would silently raise one of the two.
 */

/** The lengths the composer offers, in seconds. */
export const VIDEO_DURATIONS = [8, 24, 48] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];

/** Nominal seconds per scene — the Veo grid. Mirrors FILM_CLIP_SEC. */
export const SCENE_SEC = 8;

/** The composer's ceiling on scenes per film. */
export const MAX_UI_SCENES = 6;

/**
 * 8s → 1 · 24s → 3 · 48s → 6.
 *
 * A single-scene film is intentional at 8s (it takes the assembler's single-clip path — music mux, no
 * stitch). Above that the floor is 2, because "a multi-scene film with one scene" is not a thing the
 * stitch path can produce: /api/video/assemble requires at least 2 ready segments.
 */
export function sceneCountForDuration(totalSec: number): number {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return 1;
  if (totalSec <= SCENE_SEC) return 1;
  return Math.max(2, Math.min(MAX_UI_SCENES, Math.round(totalSec / SCENE_SEC)));
}
