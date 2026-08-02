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
 * Near-pure (its only import is the pure ./billing/fx exchange-rate leaf) so it can be imported on the
 * server (cost forecasting) AND in the client (toast / UI) without pulling server-only code.
 */
import { GEL_PER_USD } from '@/lib/billing/fx';

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

/** GEL conversion (1 USD ≈ 2.7 GEL approx). Iteration 4 — aliased to the single ./billing/fx SSoT so it can
 *  never drift from pricingConfig's GEL_PER_USD. Local const so the in-module usages (creditsToUsd) resolve. */
export const USD_TO_GEL = GEL_PER_USD;

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
 * Top-up packages shown in the Credits modal. The amounts match the Stripe products
 * (9 / 29 / 89 ₾). `credits` is the FLAT 10-per-GEL value (1 credit = 0.10 ₾) — it MUST
 * equal what the wallet actually delivers (the Stripe wallet top-up credits the literal
 * GEL paid, no bonus tiers), or the modal under/over-promises. So credits = gel × 10.
 */
export interface CreditPackage {
  id: 'starter' | 'pro' | 'max';
  gel: number;
  credits: number;
  highlight: boolean;
}
/**
 * The top-up ladder.
 *
 * ⚠️ EVERY TIER USED TO BE THE SAME PRICE. starter/pro/max were 90/290/890 credits for 9/29/89 GEL —
 * exactly 10.00 credits per lari at all three. The "pro" pack was rendered with a recommended badge
 * while offering nothing whatsoever over buying the small one three times, which is not a ladder, it is
 * three copies of one product. A buyer who does the arithmetic finds no reason to spend more, and a
 * buyer who doesn't is being quietly nudged toward the option with no advantage.
 *
 * ⚠️ I BRIEFLY "FIXED" THIS BY MAKING THE BIG PACKS MORE GENEROUS (11 and 12 cr/GEL) AND THAT WAS WRONG.
 * A credit spent on VIDEO costs us 0.104 GEL in provider fees (video_30s = 25 cr against $0.96 of
 * inference, at 2.7 GEL/USD) while a credit SELLS for 0.10 GEL. So the flat ladder below already runs at
 * a 0.96x margin on video-heavy spend — a loss — and sweetening the larger packs took it to 0.80x. The
 * numbers are back where they were, and the flat rate is now a KNOWN problem rather than an accident.
 *
 * ⚠️ THE REAL DEFECT IS THAT CREDIT_VALUE_GEL IS TOO LOW, not that the ladder lacks a discount. Fixing
 * it means either charging more per credit, or capping what top-up credits may be spent on, and both
 * are commercial decisions. Do not add a volume bonus here until the base rate covers video.
 * lib/billing/pricingTiers.test.ts guards the SUBSCRIPTION side with a 2.5x-4.5x margin band; the
 * top-ups have no such guard, which is how this went unnoticed.
 */
export const CREDIT_PACKAGES: ReadonlyArray<CreditPackage> = [
  { id: 'starter', gel: 9, credits: 90, highlight: false },
  { id: 'pro', gel: 29, credits: 290, highlight: true },
  { id: 'max', gel: 89, credits: 890, highlight: false },
];

/** How much better a pack's rate is than the smallest one, as a whole percent (0 for the baseline). */
export function packageBonusPct(pkg: { gel: number; credits: number }): number {
  const base = CREDIT_PACKAGES[0];
  if (!base || pkg.gel <= 0 || base.credits <= 0) return 0;
  const baseRate = base.credits / base.gel;
  const rate = pkg.credits / pkg.gel;
  return Math.max(0, Math.round(((rate - baseRate) / baseRate) * 100));
}

/**
 * What a credit amount actually BUYS, in the unit a person thinks in.
 *
 * ⚠️ "901 CREDITS" IS NOT A QUANTITY ANYONE CAN REASON ABOUT. The balance, the packages and the price
 * tags were all denominated in a token whose worth the user has to work out from a second number
 * somewhere else on the screen. "450 images" needs no arithmetic and no second number. This is the one
 * translation that makes the whole system legible, so it is defined next to the costs it derives from
 * and can never drift from them.
 */
export function creditsBuyImages(credits: number): number {
  return Math.floor(Math.max(0, credits) / CREDIT_COSTS.image_generate);
}
export function creditsBuyVideos(credits: number): number {
  return Math.floor(Math.max(0, credits) / CREDIT_COSTS.video_30s);
}

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
