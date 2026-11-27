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

type OmniTable = { readonly '720p': { readonly 4: number; readonly 6: number; readonly 8: number; readonly 10: number }; readonly '1080p': { readonly 4: number; readonly 6: number; readonly 8: number; readonly 10: number } };

/** The shape both books share (today's and v8), so every helper below reads either one. */
export interface PriceBook {
  readonly clip: Readonly<Record<ClipTier, number>>;
  readonly shortClip: Readonly<Record<ClipTier, { readonly 4: number; readonly 6: number }>>;
  readonly omniClip: OmniTable;
  readonly omniEdit: OmniTable;
  readonly filmScene: number;
  readonly filmBase: number;
  readonly musicVideoSongPerScene: number;
  readonly image: number;
  readonly interiorPlan: number;
  readonly music: { readonly under60: number; readonly under90: number; readonly from90: number; readonly fullSong: number };
  readonly remixVoiceover: number;
  readonly remixMusic: number;
  readonly research: number;
  readonly dubbingPerMinute: number;
  readonly presentationDeck: number;
}

/** Today's book (the 100 %-profit-over-cost rule). What Production charges while NEXT_PUBLIC_PRICING_V8 is off. */
export const PRICE_BOOK_TODAY = {
  /** One 8 s Veo 3.1 clip at 1080p, by tier (priced at the with-sound rate); a shorter clip pays its seconds' share. */
  clip: { lite: 43, fast: 64, standard: 213 },
  /**
   * A bare 4 s / 6 s clip (a remixed scene of a 4–6 s film): its own rule price, since the clip's cropping and hosting weigh
   * more on a short clip than the 8 s clip's per-second share carries.
   */
  shortClip: { lite: { 4: 22, 6: 33 }, fast: { 4: 33, 6: 48 }, standard: { 4: 107, 6: 160 } },
  /**
   * One Gemini Omni Flash clip on Vertex, by resolution and length, with its own sound and speech. The 10 s row was set on
   * the owner's card 2026-10-25 16:51Z („720p ✦69 + 1080p ✦102"); 4 · 6 · 8 s — a clip in which a character says a
   * Georgian line, which Omni says in their own voice — on the card 2026-10-26 10:55Z („Omni ამ ფასებით"). The rule
   * recomputes every one from unitEconomics' video.omni.* lines (the 2026-10-25 Vertex probe and Google's list price).
   * v5.1 M-3: on Omni 1.2 Flash ($12.00 / 1M video out, was $17.50) the rule falls ~32% and every row follows it
   * (was 720p 28 · 42 · 55 · 69, 1080p 42 · 62 · 82 · 102). GG card 2026-11-12 14:22Z ("Lower to your 100% rule").
   */
  omniClip: { '720p': { 4: 20, 6: 29, 8: 38, 10: 47 }, '1080p': { 4: 29, 6: 43, 8: 57, 10: 71 } },
  /**
   * An uploaded video edited or extended by Gemini Omni Flash, by resolution and by the seconds it renders (an edit: the
   * video's own length, rounded up to 4 · 6 · 8 · 10 s; an extend: the new seconds). Set on the owner's card 2026-10-25
   * 17:04Z („კი, ორივე"); the rule (unitEconomics' video.omni-edit.* lines, the 2026-10-25 probe) is at most these — two
   * sat one credit above it (720p 6 s, 1080p 4 s and 6 s), as GG set them. v5.1 M-3: on Omni 1.2 every row is the rule
   * (was 720p 34 · 48 · 61 · 74, 1080p 48 · 68 · 88 · 108). GG card 2026-11-12 14:22Z.
   */
  omniEdit: { '720p': { 4: 25, 6: 35, 8: 44, 10: 53 }, '1080p': { 4: 35, 6: 48, 8: 62, 10: 76 } },
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
  presentationDeck: 54,
} as const satisfies PriceBook;

/**
 * The v8 book: 65 % gross margin at the 0.08 ₾ floor credit (Phase 8.1, APPROVED by GG 2026-11-14 10:26Z, e.g. 720p 8 s
 * Omni ✦66). Literal numbers so this file stays client-safe; lib/billing/margin/priceBookV8.test recomputes every one from
 * the approved price list and the 65 % rule (lib/billing/margin/priceBookV8.ts) and fails when one drifts.
 */
export const PRICE_BOOK_V8 = {
  clip: { lite: 74, fast: 111, standard: 368 },
  shortClip: { lite: { 4: 38, 6: 56 }, fast: { 4: 56, 6: 84 }, standard: { 4: 185, 6: 276 } },
  omniClip: { '720p': { 4: 34, 6: 50, 8: 66, 10: 83 }, '1080p': { 4: 50, 6: 74, 8: 98, 10: 122 } },
  omniEdit: { '720p': { 4: 43, 6: 59, 8: 75, 10: 91 }, '1080p': { 4: 59, 6: 83, 8: 107, 10: 131 } },
  filmScene: 12,
  filmBase: 6,
  musicVideoSongPerScene: 3,
  image: 8,
  interiorPlan: 7,
  music: { under60: 6, under90: 11, from90: 11, fullSong: 11 },
  remixVoiceover: 9,
  remixMusic: 1,
  research: 345,
  dubbingPerMinute: 11,
  presentationDeck: 93,
} as const satisfies PriceBook;

/**
 * NEXT_PUBLIC_PRICING_V8=on|1|true switches every price to the v8 book. Read LITERALLY from process.env so Next inlines it
 * into the browser bundle too (the button and the route then show and charge the same number). Off by default.
 */
export function pricingV8Active(value: string | undefined = process.env.NEXT_PUBLIC_PRICING_V8): boolean {
  return value === 'on' || value === '1' || value === 'true';
}

/** THE book every price reads: v8 when the flag is on, today's otherwise. */
export const PRICE_BOOK: PriceBook = pricingV8Active() ? PRICE_BOOK_V8 : PRICE_BOOK_TODAY;

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

export type OmniResolution = keyof typeof PRICE_BOOK.omniClip;
export type OmniClipSeconds = keyof (typeof PRICE_BOOK.omniClip)['720p'];

/** One Omni Flash clip at `resolution` (720p unless 1080p is asked for), `seconds` long (10 unless 4, 6 or 8). */
export function omniClipCredits(resolution: OmniResolution = '720p', seconds: number = 10): number {
  const s: OmniClipSeconds = seconds === 4 || seconds === 6 || seconds === 8 ? seconds : 10;
  return PRICE_BOOK.omniClip[resolution === '1080p' ? '1080p' : '720p'][s];
}

export type OmniEditSeconds = keyof (typeof PRICE_BOOK.omniEdit)['720p'];

/** An uploaded video edited or extended by Omni Flash: `seconds` rendered at `resolution` (720p unless 1080p is asked for). */
export function omniEditCredits(seconds: OmniEditSeconds, resolution: OmniResolution = '720p'): number {
  return PRICE_BOOK.omniEdit[resolution === '1080p' ? '1080p' : '720p'][seconds];
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
