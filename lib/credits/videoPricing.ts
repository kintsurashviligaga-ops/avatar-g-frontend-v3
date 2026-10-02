/**
 * lib/credits/videoPricing.ts — what a film costs, by the second. Pure and client-safe: the Generate button, the
 * pre-flight balance gate, the film's up-front charge and the assemble step all call THESE functions, so the number
 * on the button is the number on the bill.
 *
 * ⚠️ WHY THIS EXISTS. The studio quoted "25 credits" for every film and charged 20 at the final stitch — whatever its
 * length — while every clip is a Veo render ($0.96 for 8 s on Fast, $3.20 on Standard). A 48-second film cost the
 * platform ~$5.76 and the customer 20 credits, and `creditCostFor('video')` could not say otherwise (25 below a minute,
 * 45 above). Length now sets the price.
 *
 * THE ANCHOR IS THE OWNER'S OWN NUMBER: one video clip = 25 credits (CREDIT_COSTS.video_30s, the unit the plans'
 * credit pools and the pricing page's "4 video clips" are built on). A clip is 8 s, so 25 / 8 = 3.125 credits per
 * second on the default (Fast) tier, and the plans' arithmetic does not move. Other tiers scale by the real price ratio
 * (lib/veo/capabilities.ts, $/s with audio: Lite 0.05–0.08, Fast 0.10–0.12, Standard 0.40).
 *
 * ⚠️ MARGIN, STATED PLAINLY: 3.125 credits is $0.116 at the TOP-UP credit value (0.10 ₾ ≈ $0.037) — within a few percent of
 * Veo Fast's $0.10–0.12/s, i.e. a pay-as-you-go film sells at cost; a PLAN credit is worth ~$0.087 and carries the margin
 * (≈ 2.3×). The base rate (CREDIT_VALUE_GEL) is the owner's lever — see the note on CREDIT_PACKAGES. Change
 * VIDEO_CREDITS_PER_SEC / VIDEO_QUALITY_MULT here and every surface follows.
 */
import { VIDEO_MAX_SEC, VIDEO_MIN_SEC } from '@/lib/video/duration';

/** Credits per second of finished film on the default (Fast) tier — 25 credits per 8 s clip. */
export const VIDEO_CREDITS_PER_SEC = 25 / 8;

export type VideoQuality = 'lite' | 'fast' | 'standard';

/**
 * The Veo tier every PRICED film / clip renders on unless the caller picks another.
 *
 * ⚠️ THE ENGINE'S OWN DEFAULT (lib/veo/capabilities DEFAULT_TIER) IS STANDARD — $0.40/s, 3.3× Fast — and it stays that way for
 * the engine's own callers and tests. But every PRICE in this file is anchored on Fast (25 credits per 8 s clip), so a priced
 * request that fell through to the engine default sold a $3.20 render for ~$0.93. Priced call sites therefore pass THIS
 * explicitly. Standard is one tap away ("Max quality") at the Standard multiplier.
 */
export const STUDIO_DEFAULT_VEO_TIER: VideoQuality = 'fast';

/** Price ratio to Fast, from the published per-second rates (Standard 0.40 vs Fast 0.12; Lite 0.08 vs 0.12 → ~0.6). */
export const VIDEO_QUALITY_MULT: Readonly<Record<VideoQuality, number>> = { lite: 0.6, fast: 1, standard: 3.3 };

/**
 * A music video adds a generated song and the singer's lip-synced close-ups to every scene's clip: priced 1.4× the
 * same documentary film (the song and a HeyGen leg per scene against the ~$1 clip).
 */
export const MUSIC_VIDEO_MULT = 1.4;

export type VideoMode = 'documentary' | 'musicvideo';

export interface VideoQuoteInput {
  seconds: number;
  quality?: VideoQuality;
  mode?: VideoMode;
}

const clampSeconds = (s: number): number => {
  const n = Number.isFinite(s) ? Math.round(s) : VIDEO_MIN_SEC;
  return Math.min(VIDEO_MAX_SEC, Math.max(VIDEO_MIN_SEC, n));
};

/** Credits for a film of `seconds` — rounded UP to a whole credit (never under-charge by a fraction). */
export function videoCredits(input: VideoQuoteInput): number {
  const s = clampSeconds(input.seconds);
  const q = VIDEO_QUALITY_MULT[input.quality ?? 'fast'] ?? 1;
  const m = input.mode === 'musicvideo' ? MUSIC_VIDEO_MULT : 1;
  // The 1e-9 absorbs float noise (8 × 3.125 × 1 is exact, 8 × 3.125 × 3.3 is 82.50000000000001).
  return Math.max(1, Math.ceil(s * VIDEO_CREDITS_PER_SEC * q * m - 1e-9));
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
