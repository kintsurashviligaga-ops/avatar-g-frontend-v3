/**
 * lib/credits/videoPricing.ts — what a film costs, by its length. Pure and client-safe: the Generate button, the
 * pre-flight balance gate, the film's up-front charge and the assemble step all call THESE functions, so the number
 * on the button is the number on the bill.
 *
 * ⚠️ WHY THIS EXISTS. The studio quoted "25 credits" for every film and charged 20 at the final stitch — whatever its
 * length — while every clip is a Veo render. Length sets the price.
 *
 * THE NUMBERS ARE THE PRICE BOOK'S (lib/credits/priceBook, the owner's 100 %-profit rule, PRD v2 §1.1): a film is its base
 * plus one scene per started 8 s, each scene its Veo clip on the chosen tier and what the film adds to it (storyboard
 * frame, narration, music bed). A single clip that is not a film scene (VFX, an Agent G queue clip) is priced with
 * priceBook.clipCredits; one scene redone, or a Veo avatar clip, with priceBook.sceneCredits.
 */
import { VIDEO_MAX_SEC, VIDEO_MIN_SEC } from '@/lib/video/duration';
import { filmCredits, sceneCredits } from './priceBook';

export type VideoQuality = 'lite' | 'fast' | 'standard';

/**
 * The Veo tier every PRICED film / clip renders on unless the caller picks another.
 *
 * ⚠️ THE ENGINE'S OWN DEFAULT (lib/veo/capabilities DEFAULT_TIER) IS STANDARD — $0.40/s, 3.3× Fast — and it stays that way for
 * the engine's own callers and tests. A priced request that fell through to the engine default would sell a Standard render
 * at the Fast price, so priced call sites pass THIS explicitly. Standard is one tap away ("Max quality") at its own price.
 */
export const STUDIO_DEFAULT_VEO_TIER: VideoQuality = 'fast';

/** Credits per second of a Fast film scene (an estimate's unit, e.g. the director's plan; a charge uses videoCredits). */
export const VIDEO_CREDITS_PER_SEC = sceneCredits('fast') / 8;

/**
 * What a tier does to a scene's price against Fast, for the pickers' "−30 % / +210 %" labels (display only: the button and
 * the bill show videoCredits itself). Derived from the price book, so a price change moves the label with it.
 */
export const VIDEO_QUALITY_MULT: Readonly<Record<VideoQuality, number>> = {
  lite: sceneCredits('lite') / sceneCredits('fast'),
  fast: 1,
  standard: sceneCredits('standard') / sceneCredits('fast'),
};

/** A music video's scene against a documentary one (the sung song under it), for the picker's surcharge label. */
export const MUSIC_VIDEO_MULT = sceneCredits('fast', true) / sceneCredits('fast');

export type VideoMode = 'documentary' | 'musicvideo';

export interface VideoQuoteInput {
  seconds: number;
  /** The film's scene count when the caller knows its grid (clips can be 4–8 s); else one per started 8 s. */
  scenes?: number;
  quality?: VideoQuality;
  mode?: VideoMode;
  /** Veo reference-image mode: every clip renders, and bills, 8 s whatever the film's grid. */
  referenceMode?: boolean;
}

const clampSeconds = (s: number): number => {
  const n = Number.isFinite(s) ? Math.round(s) : VIDEO_MIN_SEC;
  return Math.min(VIDEO_MAX_SEC, Math.max(VIDEO_MIN_SEC, n));
};

/** Credits for a film of `seconds` on its tier (Fast unless given), clamped to the studio's range. */
export function videoCredits(input: VideoQuoteInput): number {
  const quality = input.quality && input.quality in VIDEO_QUALITY_MULT ? input.quality : STUDIO_DEFAULT_VEO_TIER;
  return filmCredits(clampSeconds(input.seconds), quality, input.mode === 'musicvideo', input.scenes, input.referenceMode === true);
}

/** What ONE scene costs when a film of `sceneCount` scenes is refunded scene by scene (the film price, split evenly, rounded). */
export function perSceneCredits(totalCredits: number, sceneCount: number): number {
  return sceneCount > 0 ? Math.floor(totalCredits / sceneCount) : 0;
}

/**
 * A film's real length from the clips it actually has — what the assemble step charges. Each clip counts at the
 * length the renderer reported (default 8 s, the Veo grid), clamped to the studio's range.
 */
export function filmSecondsFromClips(clips: ReadonlyArray<{ durationSec?: number | null }>, defaultClipSec = 8): number {
  const total = clips.reduce((sum, c) => {
    const d = Number(c.durationSec);
    return sum + (Number.isFinite(d) && d > 0 ? d : defaultClipSec);
  }, 0);
  return clampSeconds(total);
}
