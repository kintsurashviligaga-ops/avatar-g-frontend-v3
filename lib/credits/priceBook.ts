/**
 * lib/credits/priceBook.ts — THE price of every paid operation, in credits (1 credit = 0.10 ₾). Pure and client-safe.
 *
 * ⚠️ ONE BOOK. creditCostFor (lib/credits/pricing), videoCredits (videoPricing), quoteCredits (quote), the VFX, remix,
 * avatar, Agent G queue and chat-billing prices all read these numbers, so the number on a button, the number the route
 * charges and the number the admin panel shows are one number. A price changes HERE, in one commit, on the owner's word.
 *
 * THE RULE (owner, PRD v2 §1.1, 2026-10-18): every price earns exactly 100 % profit over the operation's full cost — the
 * price is twice the API cost (Google, ElevenLabs) plus the bank's fee on it, rounded UP to a whole credit. The costs and
 * the formula live in lib/credits/unitEconomics.ts; priceBook.test.ts recomputes every number below from them and fails
 * when one drifts, so a cost change can never move a Production price silently, and a price can never fall under the rule.
 * The table, today's prices and the 2026-10-10 proposal side by side: docs/handoffs/pricing/PRICE_BOOK_2026-10-18.md.
 *
 * A film is priced by its parts: filmBase + the Veo seconds its clips render (clip[tier] per 8 s, Veo bills by the second
 * on its 4 / 6 / 8 s grid) + per scene (filmScene [+ musicVideoSongPerScene]). One bare Veo clip (a VFX scene, an Agent G
 * queue clip, a conversational remix's re-rendered scene) is clip[tier] alone.
 */

export type ClipTier = 'lite' | 'fast' | 'standard';

export const PRICE_BOOK = {
  /** One 8 s Veo 3.1 clip at 1080p, by tier (priced at the with-sound rate); a shorter clip pays its seconds' share. */
  clip: { lite: 43, fast: 64, standard: 213 },
  /**
   * A bare 4 s / 6 s clip (a remixed scene of a 4–6 s film): its own rule price, since the clip's cropping and hosting weigh
   * more on a short clip than the 8 s clip's per-second share carries.
   */
  shortClip: { lite: { 4: 22, 6: 33 }, fast: { 4: 33, 6: 48 }, standard: { 4: 107, 6: 160 } },
  /** What a film scene adds to its clip: the storyboard frame, ~8 s of narration and music bed, cropping and hosting. */
  filmScene: 7,
  /** Once per film: the plan and the assembly. */
  filmBase: 4,
  /** The sung song under a music video, per 8 s scene. */
  musicVideoSongPerScene: 2,
  /** One image (also each Photographer / Interior render): gemini-3.1-flash-image at 1K. */
  image: 5,
  /** One Interior 3D floor plan (gemini-3.8-flash). */
  interiorPlan: 4,
  /**
   * A track by length band: under 60 s (Lyria 3 Clip, $0.04), 60–89 s and 90 s or more (Lyria 3 Pro, $0.08 a song whatever
   * its length), and the full song of up to ~3 minutes (Lyria 3 Pro; its own row, read by musicCredits(180)). Pro's flat
   * price is why the three long rows match; each is still pinned to its own cost line in unitEconomics.
   */
  music: { under60: 3, under90: 6, from90: 6, fullSong: 6 },
  /** A voice-over laid on a video (ElevenLabs speech, ~60 s, + the mix). */
  remixVoiceover: 5,
  /** The user's own track laid under a video (FFmpeg only, no generation). */
  remixMusic: 1,
  /** One Deep Research report (Google's agent; priced at the top of its $1–3 range). */
  research: 200,
  /** Dubbing, per started minute of source. Runs only once the owner approves this number (OWNER_APPROVED_PRICING). */
  dubbingPerMinute: 6,
  /** A deck of up to 12 illustrated slides. Runs only once the owner approves this number (OWNER_APPROVED_PRICING). */
  presentationDeck: 34,
} as const;

/** Scenes in a film of `seconds` when the caller does not know its grid: one per started 8 s (Veo's longest clip). */
export function filmScenes(seconds: number): number {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 8;
  return Math.max(1, Math.ceil(s / 8 - 1e-9));
}

const tierOf = (tier: ClipTier | undefined): ClipTier => (tier && tier in PRICE_BOOK.clip ? tier : 'fast');

/** `seconds` of Veo on `tier`: the 8 s clip's price, by the second, rounded UP to a whole credit. */
export function veoSecondsCredits(seconds: number, tier: ClipTier = 'fast'): number {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 8;
  return Math.ceil((PRICE_BOOK.clip[tierOf(tier)] * s) / 8 - 1e-9);
}

/** One bare 8 s Veo clip on `tier`. */
export function clipCredits(tier: ClipTier = 'fast'): number {
  return PRICE_BOOK.clip[tierOf(tier)];
}

/**
 * The seconds Veo actually renders, and bills, for a clip of `clipSec`: its 4 / 6 / 8 s grid with a half-way length rounded
 * UP (5 → 6, 7 → 8, as lib/veo/capabilities snaps it), and always 8 in reference mode (Veo pins reference-image clips to
 * 8 s). A price counts these seconds, never the shorter slot the film trims the clip to.
 */
export function veoRenderedSeconds(clipSec: number, referenceMode = false): number {
  if (referenceMode) return 8;
  const s = Number.isFinite(clipSec) && clipSec > 0 ? clipSec : 8;
  return s <= 4 ? 4 : s <= 6 ? 6 : 8;
}

/**
 * One film scene of `seconds` (8 by default): its clip and what the film adds to it. Also the price of redoing one scene,
 * and of a Veo avatar clip.
 */
export function sceneCredits(tier: ClipTier = 'fast', musicVideo = false, seconds = 8, referenceMode = false): number {
  return veoSecondsCredits(veoRenderedSeconds(seconds, referenceMode), tier) + PRICE_BOOK.filmScene + (musicVideo ? PRICE_BOOK.musicVideoSongPerScene : 0);
}

/**
 * A whole film of `seconds` on `tier`: its base, the Veo seconds its clips render and every scene. `scenes` is the film's
 * own grid when the caller knows it (a 6 × 6 s film is six scenes, not the five 8 s ones its 36 s would suggest); its
 * clips are `seconds / scenes` long, each billed at the length Veo renders (veoRenderedSeconds).
 */
export function filmCredits(seconds: number, tier: ClipTier = 'fast', musicVideo = false, scenes?: number, referenceMode = false): number {
  const total = Number.isFinite(seconds) && seconds > 0 ? seconds : 8;
  const n = Number.isFinite(scenes) && (scenes as number) >= 1 ? Math.floor(scenes as number) : filmScenes(total);
  const perScene = PRICE_BOOK.filmScene + (musicVideo ? PRICE_BOOK.musicVideoSongPerScene : 0);
  return PRICE_BOOK.filmBase + veoSecondsCredits(n * veoRenderedSeconds(total / n, referenceMode), tier) + n * perScene;
}

/**
 * One scene a conversational film remix re-renders (/api/pipeline/remix): a bare Veo clip of the length Veo renders for the
 * film's grid (4, 6 or 8 s), on the tier it renders on. The remix pays this per edited scene.
 */
export function remixSceneCredits(clipSec = 8, tier: ClipTier = 'fast', referenceMode = false): number {
  const t = tierOf(tier);
  const s = veoRenderedSeconds(clipSec, referenceMode);
  return s === 4 || s === 6 ? PRICE_BOOK.shortClip[t][s] : PRICE_BOOK.clip[t];
}

/** The length a full song bills at: musicCredits(FULL_SONG_SEC) is the full-song row. */
export const FULL_SONG_SEC = 180;

/** A track of `seconds` (the band it bills at). */
export function musicCredits(seconds = 30): number {
  const m = PRICE_BOOK.music;
  return seconds >= FULL_SONG_SEC ? m.fullSong : seconds >= 90 ? m.from90 : seconds >= 60 ? m.under90 : m.under60;
}
