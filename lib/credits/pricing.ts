/**
 * lib/credits/pricing.ts
 * ======================
 * SINGLE SOURCE OF TRUTH for what each generation costs the user, in credits.
 *
 * The app's real balance lives in the GEL wallet (the `₾` pill in the top bar,
 * the per-leg debits in the film pipeline). This module is the *pricing layer*
 * on top of it: it defines the credit cost of every action, the GEL/USD
 * conversion, and the helpers the UI uses to show "−N credits" after a
 * generation. It does NOT debit anything — the existing wallet/margin engine
 * still owns the actual charge. Keeping all the numbers here means a price change
 * is a one-file edit, and the same constants drive both the toast and any future
 * pre-flight "this will cost N credits" hint.
 *
 * Pure + dependency-free so it can be imported on the server (cost forecasting)
 * AND in the client (toast / UI) without pulling server-only code.
 */

/** Approximate wholesale API cost per unit, in USD. Used for margin sanity-checks. */
export const API_COSTS_USD = {
  image: {
    nanoBanana_per_image: 0.003, // ~$0.003 per image
  },
  music: {
    udio_30s: 0.01,
    udio_60s: 0.02,
    udio_90s: 0.03,
  },
  video: {
    ltx_clip_5s: 0.05, // per 5s clip
    heygen_lipsync: 0.1,
    elevenlabs_tts_per_char: 0.00003,
    ffmpeg_assembly: 0.0, // free (server compute)
  },
  avatar: {
    heygen_per_second: 0.05,
  },
  chat: {
    claude_sonnet_per_1k_tokens: 0.003,
    gemini_per_1k_tokens: 0.001,
  },
} as const;

/** GEL conversion (1 USD ≈ 2.7 GEL approx). */
export const USD_TO_GEL = 2.7;

/** Credit system: 1 credit = 0.10 GEL ≈ 0.037 USD. */
export const CREDIT_VALUE_GEL = 0.1;

/** Cost in CREDITS per user-facing action (1 credit = 0.10 GEL). */
export const CREDIT_COSTS = {
  image_generate: 2, // 0.20 GEL
  music_30s: 5, // 0.50 GEL
  music_60s: 8, // 0.80 GEL
  music_90s: 12, // 1.20 GEL
  video_30s: 25, // 2.50 GEL (covers 6 clips + assembly)
  video_60s: 45, // 4.50 GEL
  avatar_30s: 20, // 2.00 GEL
  chat_message: 0, // free
  remix_video: 15, // 1.50 GEL
} as const;

export type CreditAction = keyof typeof CREDIT_COSTS;

/** GEL value of a credit amount (rounded to the tetri / 0.01 ₾). */
export function creditsToGel(credits: number): number {
  return Math.round(credits * CREDIT_VALUE_GEL * 100) / 100;
}

/** Credits a GEL balance is worth (1 credit = 0.10 ₾ → ×10), rounded. */
export function gelToCredits(gel: number): number {
  return Math.round((gel || 0) / CREDIT_VALUE_GEL);
}

/**
 * Top-up packages shown in the Credits modal. Higher tiers carry a bonus (pro +25%,
 * max +40%) over the flat 10-credits-per-GEL rate, which is why max is 700 not 500.
 * `approxVideos` / `approxImages` give the "what you get" feel (video_30s=25, image=2).
 */
export interface CreditPackage {
  id: 'starter' | 'pro' | 'max';
  gel: number;
  credits: number;
  highlight: boolean;
}
// Flat GEL → credits (1 credit = 0.10 ₾, so credits = gel × 10). The Stripe wallet
// top-up credits the literal GEL paid (no bonus tiers), so the advertised credits
// must equal what's delivered — otherwise the modal over-promises.
export const CREDIT_PACKAGES: ReadonlyArray<CreditPackage> = [
  { id: 'starter', gel: 5, credits: 50, highlight: false },
  { id: 'pro', gel: 20, credits: 200, highlight: true },
  { id: 'max', gel: 50, credits: 500, highlight: false },
];

/** USD value of a credit amount. */
export function creditsToUsd(credits: number): number {
  return Math.round((creditsToGel(credits) / USD_TO_GEL) * 1000) / 1000;
}

/**
 * Credit cost for a generation, resolved by kind + size so the SAME helper covers
 * every surface. `seconds` picks the music/video tier; `count` multiplies batch
 * image jobs (×2/×4 grids). Unknown kinds → 0 (never over-charge on a guess).
 */
export function creditCostFor(
  kind: 'image' | 'music' | 'video' | 'avatar' | 'remix' | 'chat',
  opts: { seconds?: number; count?: number } = {},
): number {
  const C = CREDIT_COSTS;
  switch (kind) {
    case 'image':
      return C.image_generate * Math.max(1, opts.count ?? 1);
    case 'music': {
      const s = opts.seconds ?? 30;
      return s >= 90 ? C.music_90s : s >= 60 ? C.music_60s : C.music_30s;
    }
    case 'video': {
      const s = opts.seconds ?? 30;
      return s >= 60 ? C.video_60s : C.video_30s;
    }
    case 'avatar':
      return C.avatar_30s;
    case 'remix':
      return C.remix_video;
    case 'chat':
    default:
      return C.chat_message;
  }
}

/**
 * Localised "−N credits · X.XX ₾" line for the post-generation toast. Returns null
 * for a free (0-credit) action so the caller can skip the toast entirely.
 */
export function formatCreditDeduction(credits: number, locale: 'ka' | 'en' | 'ru' = 'ka'): string | null {
  if (!credits || credits <= 0) return null;
  const gel = creditsToGel(credits).toFixed(2);
  const unit =
    locale === 'en' ? `${credits} credits` : locale === 'ru' ? `${credits} кред.` : `${credits} კრედიტი`;
  return `−${unit} · ${gel} ₾`;
}
