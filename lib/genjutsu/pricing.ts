/**
 * lib/genjutsu/pricing.ts — what one press of the VFX Generate button costs, in credits. Pure and client-safe.
 *
 * ⚠️ THE NUMBER ON THE BUTTON IS THE NUMBER ON THE BILL. For the op this function prices (`scene`), the panel calls it
 * to label the button and POST /api/genjutsu/generate calls the SAME function to charge — and refuses (409
 * `price_changed`, before anything is taken) when the browser's `expectedCredits` differs from the server's, so a stale
 * bundle can never bill a different amount than it displayed.
 *
 * THE COST MATH (scene = ONE Veo clip, so it is priced as one film clip — never its own invented number):
 *   scene  = videoCredits({ seconds: 8, quality })                    (lib/credits/videoPricing)
 *          · Fast     8 s → ceil(8 × 3.125 × 1.0) = 25 credits  = 2.50 ₾ ≈ $0.93   vs Veo Fast     $0.12/s × 8 = $0.96
 *          · Standard 8 s → ceil(8 × 3.125 × 3.3) = 83 credits  = 8.30 ₾ ≈ $3.07   vs Veo Standard $0.40/s × 8 = $3.20
 *   A reference photo is conditioning, not a billed unit — Google prices the clip by its seconds — so `refsUsed` does
 *   not move the price (it is in the signature because an engine that bills per reference would need it here, and so
 *   a caller can never forget to say how many were used). The margin is exactly the film's: a pay-as-you-go clip sells
 *   within a few percent of cost, a PLAN credit carries the margin (see the note in lib/credits/videoPricing).
 *
 * `motion` and `swap` are PROVIDER-QUOTED: Higgsfield bills them per second of video with live discounts (Kling 3 MC
 * Std lists $0.126/s and was 50 % off on 2026-10-02; Genjutsu object-swap lists $0.318 / $0.681 / $1.632 per second at
 * 480 / 720 / 1080p), so no constant in this repo can be the bill. The studio saga prices them from the live /estimate
 * (usd × GEL/USD × HF_GEL_MARGIN 1.35, rounded UP to a whole credit — lib/providers/pricing) and refuses a charge whose
 * `confirmedGel` is not that fresh quote. Their `genjutsuCredits` is therefore `null` — "ask the server" — and the
 * panel shows no price until POST /api/genjutsu/quote has answered. An invented local estimate would be a number on
 * the button that is not the number on the bill.
 */
import { videoCredits, type VideoQuality } from '@/lib/credits/videoPricing';
import { ENGINES, qualityFor } from './engines';
import { SCENE_SECONDS } from './limits';
import type { GenjutsuOp, GenjutsuQuality } from './types';

export interface GenjutsuPriceInput {
  op: GenjutsuOp;
  /** The source video's length (motion / swap). Ignored for `scene`, which is a fixed 8 s clip. */
  seconds?: number;
  /** How many reference photos the engine will really receive (selection.ts) — see the note above. */
  refsUsed?: number;
  quality?: GenjutsuQuality | null;
}

const VEO_QUALITY: Record<'fast' | 'standard', VideoQuality> = { fast: 'fast', standard: 'standard' };

/** Credits for one press, or null when the provider's live quote is the price (motion / swap). */
export function genjutsuCredits(input: GenjutsuPriceInput): number | null {
  if (ENGINES[input.op].pricing !== 'local') return null;
  // scene → Veo Fast | Standard. Lite takes no reference images, so it is not offered and not priced.
  const q = qualityFor('scene', input.quality);
  return videoCredits({ seconds: SCENE_SECONDS, quality: VEO_QUALITY[q === 'standard' ? 'standard' : 'fast'] });
}

/** Whether the credits shown for an op are this module's own price or the provider's live quote. */
export function genjutsuPriceSource(op: GenjutsuOp): 'local' | 'provider-quote' {
  return ENGINES[op].pricing;
}
