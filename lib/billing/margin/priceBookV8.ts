/**
 * lib/billing/margin/priceBookV8.ts — how every PRICE_BOOK_V8 number is derived (Phase 8.1 wiring). Pure, server/test only.
 *
 * lib/credits/priceBook.ts keeps PRICE_BOOK_V8 as literal numbers (it is client-safe and must not pull the engine into the
 * browser bundle, and importing the engine there would be a module cycle through lib/credits/pricing). priceBookV8.test
 * recomputes the whole book here and fails when a literal drifts, the same way priceBook.test pins today's book.
 *
 * Source per field, in order of preference:
 *  1. the APPROVED v8 price list (catalog.priceList, GG 2026-11-14 10:26Z) when it has the same action, e.g. 720p 8 s Omni ✦66;
 *  2. otherwise the 65 % rule (econ.minCredits) on the action's cost in lib/credits/unitEconomics (the costs today's book uses).
 * Every number is also checked to keep ≥ 65 % on the unitEconomics cost, so v8 is safe under both cost models.
 */
import { clipCostGel, deckCostGel, opCostUsd, unitOp, usdToCostGel, type VideoTier } from '@/lib/credits/unitEconomics';
import { priceOf } from './catalog';
import { minCredits } from './econ';

const TIERS: readonly VideoTier[] = ['lite', 'fast', 'standard'];
const SECS = [4, 6, 8, 10] as const;

/** unitEconomics helpers return ₾ (with the FX reserve); the margin engine takes USD. */
const gelToCostUsd = (gel: number) => gel / usdToCostGel(1);
const rule = (id: string) => minCredits(opCostUsd(unitOp(id)));
const approved = (id: string) => priceOf(id).credits;

export function computePriceBookV8() {
  const clip = Object.fromEntries(
    TIERS.map((t) => {
      const ue = minCredits(gelToCostUsd(clipCostGel(8, t)));
      // Approved rows exist for Fast and Standard 1080p; Lite is only priced at 720p in the list, so it takes the rule.
      const listed = t === 'lite' ? 0 : approved(`video.veo.${t}.1080p.8s`);
      return [t, Math.max(ue, listed)];
    }),
  ) as Record<VideoTier, number>;

  const shortClip = Object.fromEntries(
    TIERS.map((t) => [t, { 4: Math.max(minCredits(gelToCostUsd(clipCostGel(4, t))), Math.ceil((clip[t] * 4) / 8)), 6: Math.max(minCredits(gelToCostUsd(clipCostGel(6, t))), Math.ceil((clip[t] * 6) / 8)) }]),
  ) as Record<VideoTier, { 4: number; 6: number }>;

  const omniClip = Object.fromEntries(
    (['720p', '1080p'] as const).map((r) => [r, Object.fromEntries(SECS.map((s) => [s, Math.max(approved(`video.omni.${r}.${s}s`), rule(`video.omni.${r}.${s}`))]))]),
  ) as Record<'720p' | '1080p', Record<(typeof SECS)[number], number>>;

  const edit720 = Object.fromEntries(SECS.map((s) => [s, Math.max(approved(`video.omni.edit.720p.${s}s`), rule(`video.omni-edit.720p.${s}`))]));
  // No 1080p edit row in the approved list: the rule on its cost, and never under the 720p edit of the same length.
  const edit1080 = Object.fromEntries(SECS.map((s) => [s, Math.max(rule(`video.omni-edit.1080p.${s}`), edit720[s] as number)]));

  const song = Math.max(approved('music.song'), rule('music.track.180'));
  return {
    clip,
    shortClip,
    omniClip,
    omniEdit: { '720p': edit720, '1080p': edit1080 },
    filmScene: rule('video.film.scene'),
    filmBase: rule('video.film.base'),
    musicVideoSongPerScene: rule('video.music-video.song'),
    image: Math.max(approved('image.1k'), rule('image.one')),
    interiorPlan: rule('image.interior.plan3d'),
    music: {
      under60: Math.max(approved('music.clip'), rule('music.track.30')),
      under90: Math.max(song, rule('music.track.60')),
      from90: Math.max(song, rule('music.track.90')),
      fullSong: song,
    },
    remixVoiceover: rule('video.remix.voiceover'),
    remixMusic: rule('video.remix.music'),
    research: rule('research.deep'),
    dubbingPerMinute: rule('voice.dubbing.minute'),
    presentationDeck: minCredits(gelToCostUsd(deckCostGel(12))),
  };
}
