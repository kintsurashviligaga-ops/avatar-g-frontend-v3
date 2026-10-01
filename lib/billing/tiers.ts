/**
 * lib/billing/tiers.ts — THE subscription-tier catalogue. One file, one answer to "what does tier X get".
 *
 * Isomorphic and pure: no env reads at import time, no server code, no I/O. Everything that varies by deploy
 * (Stripe price ids, the operator's Pro ceiling) is passed IN as an `env` record, so the same functions run in
 * the browser (pricing UI), on the server (routes, webhook) and in jest without stubbing process.env.
 *
 *   tiers.ts (this file)        catalogue + pure helpers           ← you are here
 *   resolveTier.ts              which tier a user is on (Stripe subscription → comp → free), never throws
 *   subscriptionAllowance.ts    invoice.paid → the tier's monthly credits, once per invoice
 *   pricingConfig.ts            PRICING_TIERS — the live pricing page's ladder, DERIVED from this file
 *   docs/billing/TIERS.md       architecture, what is live vs inert, the activation checklist
 *
 * ⚠️ SIX CATALOGUES DISAGREED BEFORE THIS ONE. PRICING_TIERS (free/basic/pro/business), PLANS + CREDIT_PACKS in
 * the same file, lib/billing/plans.ts (FREE/PRO/PREMIUM/ENTERPRISE), lib/pricing/canonicalPricing.ts,
 * lib/stripe/plans.ts (placeholder price ids) and lib/monetization/plans.ts — plus arrays hard-coded in pages.
 * New subscription work reads THIS file. PRICING_TIERS is kept (its ids are on the wire: /api/billing/tier-checkout
 * takes `basic|pro|business`, and the pricing page / CreditsModal key their copy on them) but its money numbers now
 * come from here, and lib/billing/pricingTiers.test.ts fails if the two ever drift. The others are legacy; do not
 * add to them.
 *
 * ⚠️ THE NUMBERS ARE TODAY'S LIVE NUMBERS, RENAMED — NOT A NEW PRICE LIST. starter = the page's "Basic" ($19.99,
 * 230 credits), creator = "Pro" ($39.99, 525), business = "Business" ($79.99, 1200). The live pricing page keeps
 * telling the truth about what a tier costs and contains. Changing a price here changes the page; it does NOT
 * change what Stripe charges — that is the Stripe Price object behind STRIPE_PRICE_<TIER>, and the two must be
 * moved together (see the activation checklist).
 */
import { CHAT_MODE_IDS, type ChatModeId } from '@/lib/chat/chatModes';
import { CREDIT_COSTS } from '@/lib/credits/pricing';
import type { VeoTier } from '@/lib/veo/types';

export type TierId = 'free' | 'starter' | 'creator' | 'business';
export type PaidTierId = Exclude<TierId, 'free'>;
export type TierLocale = 'ka' | 'en' | 'ru';

/** Ascending order — also the `rank` of each tier (index), used to pick the higher of two. */
export const TIER_IDS: readonly TierId[] = ['free', 'starter', 'creator', 'business'];
export const PAID_TIER_IDS: readonly PaidTierId[] = ['starter', 'creator', 'business'];

/** The per-medium breakdown a tier's credits are marketed as. The credits are one pool; this is how it is framed. */
export interface CreditCeiling {
  videos: number;
  music: number;
  images: number;
}

/**
 * Σ (ceiling × per-asset media credit cost). The pool is DERIVED from the ceiling so a media-cost change in
 * lib/credits/pricing flows through instead of silently drifting from a hard-coded total.
 * (pricingConfig re-exports this under the same name; every existing importer is unchanged.)
 */
export function tierCreditPool(ceiling: CreditCeiling): number {
  return (
    ceiling.videos * CREDIT_COSTS.video_30s +
    ceiling.music * CREDIT_COSTS.music_30s +
    ceiling.images * CREDIT_COSTS.image_generate
  );
}

export interface SubscriptionTier {
  id: TierId;
  /** 0 = free … 3 = business. Higher wins when two sources disagree. */
  rank: number;
  names: Record<TierLocale, string>;
  /** The DISPLAYED monthly price. Stripe charges whatever its Price object says — keep them equal. */
  monthlyPriceUsd: number;
  creditCeiling: CreditCeiling;
  /** tierCreditPool(creditCeiling). For a paid tier: granted once per paid invoice. For free: the one-time trial. */
  includedCredits: number;
  /** 'monthly' = granted on every paid invoice; 'trial_once' = the signup grant, never renewed (see TRIAL). */
  creditCadence: 'monthly' | 'trial_once';
  chat: {
    /** Pro-mode turns per day, before the operator ceiling (proDailyLimitForTier applies it). */
    proDaily: number;
    modes: readonly ChatModeId[];
  };
  premiumTemplates: boolean;
  video: {
    /** Longest single film this tier may order, in seconds. */
    maxSeconds: number;
    /** May order films longer than LONG_FORM_THRESHOLD_SECONDS. */
    longForm: boolean;
    /** Veo quality tiers this tier may render on. */
    veoTiers: readonly VeoTier[];
  };
  /** Priority lane in the render queue. */
  priority: boolean;
  /** The env var holding this tier's RECURRING Stripe Price id. null = never sold through Stripe. */
  stripePriceEnv: string | null;
}

/**
 * A film longer than this is "long-form". 48 s is today's longest short film: the 8 / 24 / 48 s presets are the
 * 1 / 3 / 6-scene Veo grid (8 s per clip — Veo's ceiling). Anything above needs the long-form pipeline.
 */
export const LONG_FORM_THRESHOLD_SECONDS = 48;

/** The operator's hard ceiling on CHAT_PRO_DAILY_LIMIT — same bound as lib/api/rate-limit.ts chatProUserLimit(). */
export const MAX_CHAT_PRO_DAILY = 10_000;

const ALL_CHAT_MODES: readonly ChatModeId[] = CHAT_MODE_IDS;

export const TIERS: Readonly<Record<TierId, SubscriptionTier>> = {
  // ⚠️ THE FREE TIER WAS THREE CONTRADICTORY PROMISES. The card advertised 6 images (12 credits), the DB trigger
  // granted 10, and `profiles.free_films_remaining` handed out 3 free VIDEOS the credit ledger knew nothing about.
  // One grant now: 50 credits, with the video quota expressed IN the ceiling, which sums to exactly 50
  // (1×25 + 1×5 + 10×2) — so includedCredits stays derived. It is the TRIAL below, not a monthly allowance:
  // nothing renews it, and the webhook never grants a free tier anything (monthlyAllowanceCredits('free') = 0).
  //
  // ⚠️ THE 1-VIDEO CAP IS THE WHOLE COST CONTROL — `free_films_remaining` (default 1) via the race-safe
  // consume_free_film RPC, not this number. Video is the one medium sold BELOW cost (25 credits = $0.926 of
  // revenue against $0.96 of Veo), so an uncapped free grant spendable on video is a cash transfer.
  free: {
    id: 'free',
    rank: 0,
    names: { en: 'Free', ka: 'უფასო', ru: 'Бесплатно' },
    monthlyPriceUsd: 0,
    creditCeiling: { videos: 1, music: 1, images: 10 },
    includedCredits: tierCreditPool({ videos: 1, music: 1, images: 10 }),
    creditCadence: 'trial_once',
    chat: { proDaily: 5, modes: ALL_CHAT_MODES },
    premiumTemplates: false,
    // ⚠️ 8 s / Fast-at-most IS THE INTENT, AND ONLY HALF OF IT IS ENFORCED TODAY. filmComposite already drops a
    // free film from Standard to Fast; it does NOT cap the length — a free film can still be 48 s ($5.76 of
    // Veo Fast). maxVideoSecondsForTier('free') is the number to wire there. See docs/billing/TIERS.md.
    video: { maxSeconds: 8, longForm: false, veoTiers: ['lite', 'fast'] },
    priority: false,
    stripePriceEnv: null,
  },
  // Provider cost of a fully-consumed tier lands near ⅓ of its price — the 200%-margin structure — at the
  // Master Task §1.8 unit costs ($0.96 per 8 s clip · $0.10/track · $0.03/image):
  //   starter   4×8s $3.84 + 10 music $1.00 +  40 images $1.20 =  $6.04 of $19.99 (≈3.3×)
  //   creator   8×8s $7.68 + 25 music $2.50 + 100 images $3.00 = $13.18 of $39.99 (≈3.0×)
  //   business 16×8s $15.36 + 60 music $6.00 + 250 images $7.50 = $28.86 of $79.99 (≈2.8×)
  // lib/billing/pricingTiers.test.ts pins the 2.5–4.5× band.
  starter: {
    id: 'starter',
    rank: 1,
    names: { en: 'Starter', ka: 'სტარტერი', ru: 'Стартовый' },
    monthlyPriceUsd: 19.99,
    creditCeiling: { videos: 4, music: 10, images: 40 },
    includedCredits: tierCreditPool({ videos: 4, music: 10, images: 40 }),
    creditCadence: 'monthly',
    chat: { proDaily: 20, modes: ALL_CHAT_MODES },
    premiumTemplates: false,
    video: { maxSeconds: 24, longForm: false, veoTiers: ['lite', 'fast'] },
    priority: false,
    stripePriceEnv: 'STRIPE_PRICE_STARTER',
  },
  creator: {
    id: 'creator',
    rank: 2,
    names: { en: 'Creator', ka: 'კრეატორი', ru: 'Креатор' },
    monthlyPriceUsd: 39.99,
    creditCeiling: { videos: 8, music: 25, images: 100 },
    includedCredits: tierCreditPool({ videos: 8, music: 25, images: 100 }),
    creditCadence: 'monthly',
    chat: { proDaily: 100, modes: ALL_CHAT_MODES },
    premiumTemplates: true,
    video: { maxSeconds: 48, longForm: false, veoTiers: ['lite', 'fast', 'standard'] },
    priority: false,
    stripePriceEnv: 'STRIPE_PRICE_CREATOR',
  },
  // ⚠️ BUSINESS WAS CREATOR ×2 EXACTLY — 16/50/200 at 2× the price — so it delivered 13.1266 credits/$ against
  // 13.1283: paying twice as much bought very slightly FEWER credits per dollar. Music and images carry the bonus,
  // NOT video (video is the loss-making medium; 5 extra videos instead would have pushed the margin to 2.57×).
  // Now 15.00 credits/$ (+14.3% over creator), margin 2.772×, price untouched at $79.99.
  business: {
    id: 'business',
    rank: 3,
    names: { en: 'Business / Agency', ka: 'ბიზნესი / სააგენტო', ru: 'Бизнес / Агентство' },
    monthlyPriceUsd: 79.99,
    creditCeiling: { videos: 16, music: 60, images: 250 },
    includedCredits: tierCreditPool({ videos: 16, music: 60, images: 250 }),
    creditCadence: 'monthly',
    chat: { proDaily: 300, modes: ALL_CHAT_MODES },
    premiumTemplates: true,
    video: { maxSeconds: 240, longForm: true, veoTiers: ['lite', 'fast', 'standard'] },
    priority: true,
    stripePriceEnv: 'STRIPE_PRICE_BUSINESS',
  },
};

/** Every tier, ascending. */
export const TIER_LIST: readonly SubscriptionTier[] = TIER_IDS.map((id) => TIERS[id]);

/**
 * The free trial — DOCUMENTS the grants that already exist rather than inventing a new balance.
 *
 * ⚠️ THERE IS NO TRIAL BALANCE AND NO TRIAL EXPIRY, ON PURPOSE. A trial is three one-time grants made at signup,
 * all of them already live:
 *   · 50 credits   — trigger `on_auth_user_starter_balance` → `handle_auth_user_starter_balance()` inserts ONE
 *                    credit_ledger row (reason 'purchase', metadata.kind 'signup_bonus', ref 'starter:<uid>');
 *                    the ledger trigger moves profiles.credits_balance. Deduped on the signup_bonus row.
 *   · 1 free film  — profiles.free_films_remaining DEFAULT 1, spent by consume_free_film(), given back by
 *                    restore_free_film() when the render fails. Short: ≤ freeFilmMaxSeconds (intent — see free.video).
 *   · free text chat — CREDIT_COSTS.chat_message is 0; Pro turns are metered by proDailyLimitForTier('free').
 * plus 3 free avatar replies (profiles.free_avatar_chats_remaining DEFAULT 3).
 * The one new piece is a RECORD of when it started — profiles.trial_started_at (migration 20261001a) — so "has this
 * account had its trial" has an answer that does not depend on reading the ledger's metadata.
 */
export const TRIAL = {
  tier: 'free' as const,
  signupCredits: 50,
  freeFilms: 1,
  freeFilmMaxSeconds: 8,
  freeAvatarChats: 3,
  /** Credits a plain text chat turn costs during the trial (and after). */
  textChatCredits: 0,
  /** One-time — never renewed, never expires. */
  expiresAfterDays: null as number | null,
  ledgerKind: 'signup_bonus',
  recordColumn: 'profiles.trial_started_at',
} as const;

// ─── Pure helpers ────────────────────────────────────────────────────────────────────────────────────────────

/** Deploy-time configuration, passed in (process.env on the server; a plain object in tests). */
export type TierEnv = Readonly<Record<string, string | undefined>>;

export function isTierId(value: unknown): value is TierId {
  return typeof value === 'string' && (TIER_IDS as readonly string[]).includes(value);
}

export function isPaidTierId(value: unknown): value is PaidTierId {
  return typeof value === 'string' && (PAID_TIER_IDS as readonly string[]).includes(value);
}

/**
 * The tier for an id. ⚠️ AN UNKNOWN ID RESOLVES TO FREE, NEVER THROWS: every caller is deciding what someone may
 * do, and the safe answer to "I don't recognise this tier" is the least privilege, not a 500.
 */
export function tierById(id: TierId | string | null | undefined): SubscriptionTier {
  return isTierId(id) ? TIERS[id] : TIERS.free;
}

/** The higher-ranked of two tiers. */
export function higherTier(a: TierId, b: TierId): TierId {
  return TIERS[a].rank >= TIERS[b].rank ? a : b;
}

/** Credits one paid invoice of this tier grants. 0 for free — the trial is not an allowance and never renews. */
export function monthlyAllowanceCredits(tier: TierId | string | null | undefined): number {
  const t = tierById(tier);
  return t.creditCadence === 'monthly' ? t.includedCredits : 0;
}

function envValue(env: TierEnv, key: string | null): string | null {
  if (!key) return null;
  const v = env[key];
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** The recurring Stripe Price id configured for a tier, or null (free, or not configured → not purchasable). */
export function priceIdForTier(tier: TierId | string | null | undefined, env: TierEnv): string | null {
  return isTierId(tier) ? envValue(env, TIERS[tier].stripePriceEnv) : null;
}

/**
 * Which tier a Stripe Price id sells, or null.
 *
 * ⚠️ AN AMBIGUOUS PRICE RESOLVES TO NOTHING. If one price id is pasted into two STRIPE_PRICE_* vars, "which tier"
 * has no right answer, and guessing the higher one would hand out the bigger allowance on the cheaper charge.
 * null means: grant nothing, entitle nothing — the operator fixes the env.
 */
export function tierFromStripePriceId(priceId: string | null | undefined, env: TierEnv): PaidTierId | null {
  const wanted = typeof priceId === 'string' ? priceId.trim() : '';
  if (!wanted) return null;
  const matches = PAID_TIER_IDS.filter((id) => priceIdForTier(id, env) === wanted);
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * The operator's global Pro ceiling from CHAT_PRO_DAILY_LIMIT — the SAME parse as lib/api/rate-limit.ts
 * chatProUserLimit(): a whole number 0 … 10,000; anything else (unset, blank, "20/day", negative, fractional,
 * huge) means "no ceiling". 0 is a real value: Pro off for everyone.
 */
export function proDailyCeiling(env: TierEnv): number | null {
  const raw = (env.CHAT_PRO_DAILY_LIMIT ?? '').trim();
  if (!/^\d{1,6}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= MAX_CHAT_PRO_DAILY ? n : null;
}

/**
 * Pro-mode turns per day for a tier: the tier's allowance, capped by the operator's CHAT_PRO_DAILY_LIMIT.
 *
 * ⚠️ THE ENV IS A CEILING, NOT A DEFAULT. Today CHAT_PRO_DAILY_LIMIT is the one number for every account (default
 * 20). Once this is wired, a deploy that still sets it to 20 caps business (300) and creator (100) at 20 — raise
 * or unset it when tiers go live. Setting it to 0 keeps its current meaning: Pro off for everyone.
 */
export function proDailyLimitForTier(tier: TierId | string | null | undefined, env: TierEnv): number {
  const own = tierById(tier).chat.proDaily;
  const ceiling = proDailyCeiling(env);
  return ceiling === null ? own : Math.min(own, ceiling);
}

export function maxVideoSecondsForTier(tier: TierId | string | null | undefined): number {
  return tierById(tier).video.maxSeconds;
}

/**
 * May this tier order a film of `seconds`? Short films (≤ LONG_FORM_THRESHOLD_SECONDS) need only fit the tier's
 * max; anything longer additionally needs `longForm`. A non-finite or non-positive length is refused — a caller
 * that could not work out the length must not be waved through.
 */
export function canUseLongForm(tier: TierId | string | null | undefined, seconds: number): boolean {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return false;
  const t = tierById(tier);
  if (seconds > t.video.maxSeconds) return false;
  return seconds <= LONG_FORM_THRESHOLD_SECONDS || t.video.longForm;
}

export function allowsChatMode(tier: TierId | string | null | undefined, mode: ChatModeId): boolean {
  return tierById(tier).chat.modes.includes(mode);
}

export function allowsVeoTier(tier: TierId | string | null | undefined, veoTier: VeoTier): boolean {
  return tierById(tier).video.veoTiers.includes(veoTier);
}

/**
 * Map `profiles.tier` (a hand-set comp) to a catalogue tier.
 *
 * ⚠️ THE LIVE COLUMN SPEAKS A DIFFERENT VOCABULARY. profiles.tier is uppercase with CHECK ('FREE','PRO','STUDIO',
 * 'ENTERPRISE') — values from the old plan system, set by hand in the SQL editor (no application code writes it;
 * see lib/billing/entitlements.ts). Migration 20261001a widens the CHECK to also accept STARTER/CREATOR/BUSINESS.
 * Legacy values map onto the ladder by what they sold: PRO was the $39.99 rung (→ creator); STUDIO / ENTERPRISE /
 * PREMIUM / EXECUTIVE were all "the top plan" (→ business). Anything unrecognised is free.
 */
const PROFILE_TIER_MAP: Readonly<Record<string, TierId>> = {
  FREE: 'free',
  STARTER: 'starter',
  BASIC: 'starter',
  CREATOR: 'creator',
  PRO: 'creator',
  BUSINESS: 'business',
  AGENCY: 'business',
  STUDIO: 'business',
  PREMIUM: 'business',
  ENTERPRISE: 'business',
  EXECUTIVE: 'business',
};

export function tierFromProfileTier(value: unknown): TierId {
  if (typeof value !== 'string') return 'free';
  return PROFILE_TIER_MAP[value.trim().toUpperCase()] ?? 'free';
}
