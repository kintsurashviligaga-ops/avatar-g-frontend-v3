/**
 * lib/orchestrator/produceCost.ts — what each /api/orchestrator/<kind>/produce pipeline charges, in credits.
 *
 * ⚠️ ISOMORPHIC ON PURPOSE. These two declarations lived in lib/orchestrator/rate-limit.ts, which is `server-only`, so a
 * button could not show a produce route's price without a second copy of the number. They live here now and rate-limit.ts
 * re-exports them, so the route that charges (`reserveProduce(user.id, PRODUCE_COST.interior, …)`) and the button that
 * quotes it (the Interior designer's „3D plan ✦ 8") read ONE constant — the number on the button is the number on the bill.
 */

export type ProduceKind = 'film' | 'avatar' | 'interior' | 'image' | 'music' | 'voice';

/** Credits charged per successful produce (relative provider expense). */
export const PRODUCE_COST: Record<ProduceKind, number> = {
  film: 20, avatar: 15, interior: 8, image: 2, music: 6, voice: 2,
};
