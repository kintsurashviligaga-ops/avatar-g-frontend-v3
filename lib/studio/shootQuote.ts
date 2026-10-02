/**
 * lib/studio/shootQuote.ts — what ONE press of the Interior designer's or the Photographer's button costs, and the shared
 * limits of both panels. Pure and client-safe.
 *
 * ⚠️ THE NUMBER ON THE BUTTON IS THE NUMBER ON THE BILL. A press makes `shootTiles` renders; each render is its own
 * POST /api/nanobanana/image, which reserves `creditCostFor('image')` before the provider call and refunds it on every
 * failure exit. `shootCredits` is `quoteCredits({ tool:'image', count: tiles })` — `creditCostFor('image', { count })`, the
 * very function the route charges per tile with — and lib/studio/shootQuote.test.ts pins the pairing, including that the
 * route still debits through `creditCostFor('image')`. The two secondary actions carry their OWN prices, each from the
 * constant its route charges with: „3D plan" = PRODUCE_COST.interior (/api/orchestrator/interior/produce) and
 * „Walkthrough video" = videoCredits for 8 s (the Video studio it opens, lib/credits/videoPricing.ts).
 */
import { quoteCredits } from '@/lib/credits/quote';
import { PRODUCE_COST } from '@/lib/orchestrator/produceCost';

/** Photos a press may carry. The image route takes ONE reference per render, so each photo is its own render(s). */
export const SHOOT_MAX_PHOTOS = 3;
/** Renders per photo. */
export const SHOOT_COUNTS = [1, 2, 3, 4] as const;
export type ShootCount = (typeof SHOOT_COUNTS)[number];
const SHOOT_MAX_COUNT = 4;
/** The free-text brief's cap — a brief, not a paragraph (the route caps the whole prompt at 2000). */
export const SHOOT_BRIEF_MAX = 600;
/** One photo-less press is one render per count; with photos it is photos × count. */
export function shootTiles(photos: number, count: number): number {
  const p = Number.isFinite(photos) ? Math.max(0, Math.min(SHOOT_MAX_PHOTOS, Math.floor(photos))) : 0;
  const c = Number.isFinite(count) ? Math.max(1, Math.min(SHOOT_MAX_COUNT, Math.floor(count))) : 1;
  return Math.max(1, p) * c;
}

/** Credits one press of Generate costs. */
export function shootCredits(photos: number, count: number): number {
  return quoteCredits({ tool: 'image', count: shootTiles(photos, count) });
}

/** „3D plan": the produce pipeline's own price (the route reserves exactly this before it runs). */
export const PLAN_3D_CREDITS: number = PRODUCE_COST.interior;

/** „Walkthrough video": one 8 s clip — the Video studio's single-clip length and its price for it. */
export const WALKTHROUGH_SECONDS = 8;
export const walkthroughCredits = (): number => quoteCredits({ tool: 'video', seconds: WALKTHROUGH_SECONDS });

// ─── Shape and quality ────────────────────────────────────────────────────────────────────────────────────────

/** The ratios the image route accepts (the image tool's list, minus the extreme 21:9). */
export const SHOOT_ASPECTS = ['1:1', '4:5', '3:4', '2:3', '9:16', '5:4', '4:3', '3:2', '16:9'] as const;
export type ShootAspect = (typeof SHOOT_ASPECTS)[number];

export const SHOOT_QUALITIES = [['standard', '1K'], ['high', '2K'], ['ultra', '4K']] as const;
export type ShootQuality = (typeof SHOOT_QUALITIES)[number][0];

/** The supported ratio closest to a photo's own shape (log distance, so 2:1 is as far from 1:1 as 1:2). */
export function nearestAspect(width: number, height: number): ShootAspect {
  if (!(width > 0) || !(height > 0)) return '1:1';
  const r = Math.log(width / height);
  let best: ShootAspect = '1:1';
  let bestD = Infinity;
  for (const a of SHOOT_ASPECTS) {
    const [aw, ah] = a.split(':').map(Number) as [number, number];
    const d = Math.abs(Math.log(aw / ah) - r);
    if (d < bestD) { bestD = d; best = a; }
  }
  return best;
}

/**
 * Seconds a render of this tier is EXPECTED to take — what the result card paces its bar against. The same measured
 * curve as OmniStudio's imgTargetFor (NanoBanana was observed still working at 48 s; 4K Pro takes minutes).
 */
export const shootTargetSec = (quality: string): number => (quality === 'standard' ? 55 : quality === 'high' ? 75 : 215);
