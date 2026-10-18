/**
 * lib/orchestrator/produceCost.ts — what each /api/orchestrator/<kind>/produce pipeline charges, in credits.
 *
 * ⚠️ ISOMORPHIC ON PURPOSE. These two declarations lived in lib/orchestrator/rate-limit.ts, which is `server-only`, so a
 * button could not show a produce route's price without a second copy of the number. They live here now and rate-limit.ts
 * re-exports them, so the route that charges (`reserveProduce(user.id, PRODUCE_COST.interior, …)`) and the button that
 * quotes it (the Interior designer's „3D plan ✦ 8") read ONE constant — the number on the button is the number on the bill.
 */

import { PRICE_BOOK, filmCredits, musicCredits, sceneCredits } from '@/lib/credits/priceBook';

export type ProduceKind = 'film' | 'avatar' | 'interior' | 'image' | 'music' | 'voice';

/** Credits charged per successful produce — the price book's number for what each pipeline renders. */
export const PRODUCE_COST: Record<ProduceKind, number> = {
  film: filmCredits(8),
  avatar: sceneCredits('fast'),
  interior: PRICE_BOOK.interiorPlan,
  image: PRICE_BOOK.image,
  music: musicCredits(30),
  // One ElevenLabs line, the voice-over's cost class.
  voice: PRICE_BOOK.remixVoiceover,
};
