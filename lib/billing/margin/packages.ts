/**
 * lib/billing/margin/packages.ts — the PROPOSED v8 plans and top-ups (Phase 8.1). Pure. Prices in ₾ because BOG charges
 * ₾; USD is shown for comparison at $1 = 2.7 ₾. These are PROPOSALS for GG: nothing here is sold until GG approves the
 * numbers and a wiring PR moves lib/billing/tiers + bogCatalog to them (live BOG code is never touched by this PR).
 *
 * Every package must sell a credit at ≥ MARGIN_ECON.floorCreditGel, because every action is priced at that floor
 * (econ.ts). packageProblems() refuses a cheaper package, and packages.test fails the build on one. Every plan also stays
 * under BOG's 500 ₾ single-transaction limit.
 */
import { BOG_LIMITS_GEL } from '@/lib/billing/bogCatalog';
import { priceOf } from './catalog';
import { MARGIN_ECON, gelToUsd } from './econ';

export type PlanId = 'free' | 'start' | 'creator' | 'pro' | 'business';

export interface PlanOffer {
  id: PlanId;
  name: { ka: string; en: string };
  /** Charged monthly through BOG, ₾ (0 = free). */
  priceGel: number;
  /** Credits granted each paid month (free: once, at sign-up). */
  credits: number;
  cadence: 'monthly' | 'trial_once';
  /** Unused monthly credits carry over this many months (0 = expire at renewal). */
  rolloverMonths: number;
  perks: { ka: string; en: string }[];
  highlight?: boolean;
}

export interface TopupOffer {
  id: string;
  priceGel: number;
  credits: number;
  /** Bonus over the 0.10 ₾ sticker, for the badge ("+4 %"). */
  bonusPct: number;
}

export const PLANS: readonly PlanOffer[] = [
  {
    id: 'free',
    name: { ka: 'უფასო', en: 'Free' },
    priceGel: 0,
    credits: 50,
    cadence: 'trial_once',
    rolloverMonths: 0,
    perks: [
      { ka: '50 კრედიტი რეგისტრაციისას', en: '50 credits when you sign up' },
      { ka: 'ჩატი დღიური ლიმიტით', en: 'Chat with a daily limit' },
      { ka: 'ლაივ ავატარი: 1 სესია დღეში (5 წთ)', en: 'Live avatar: 1 session a day (5 min)' },
    ],
  },
  {
    id: 'start',
    name: { ka: 'სტარტი', en: 'Start' },
    priceGel: 25,
    credits: 280,
    cadence: 'monthly',
    rolloverMonths: 1,
    perks: [
      { ka: 'წყლის ნიშნის გარეშე', en: 'No watermark' },
      { ka: 'კომერციული გამოყენება', en: 'Commercial use' },
    ],
  },
  {
    id: 'creator',
    name: { ka: 'კრეატორი', en: 'Creator' },
    priceGel: 55,
    credits: 650,
    cadence: 'monthly',
    rolloverMonths: 1,
    highlight: true,
    perks: [
      { ka: '1080p ვიდეო', en: '1080p video' },
      { ka: 'პრიორიტეტული რიგი', en: 'Priority queue' },
    ],
  },
  {
    id: 'pro',
    name: { ka: 'პრო', en: 'Pro' },
    priceGel: 129,
    credits: 1550,
    cadence: 'monthly',
    rolloverMonths: 1,
    perks: [
      { ka: 'Agent G სრული წვდომა', en: 'Full Agent G access' },
      { ka: 'გრძელი ფილმები (48 წმ+)', en: 'Long films (48 s+)' },
    ],
  },
  {
    id: 'business',
    name: { ka: 'ბიზნესი', en: 'Business' },
    priceGel: 299,
    credits: 3700,
    cadence: 'monthly',
    rolloverMonths: 2,
    perks: [
      { ka: 'ყველაზე იაფი კრედიტი', en: 'Lowest price per credit' },
      { ka: 'ინვოისი კომპანიაზე', en: 'Company invoice' },
    ],
  },
];

export const TOPUPS: readonly TopupOffer[] = [
  { id: 'topup_10', priceGel: 10, credits: 100, bonusPct: 0 },
  { id: 'topup_25', priceGel: 25, credits: 260, bonusPct: 4 },
  { id: 'topup_50', priceGel: 50, credits: 540, bonusPct: 8 },
  { id: 'topup_100', priceGel: 100, credits: 1100, bonusPct: 10 },
];

export const creditGelOf = (p: { priceGel: number; credits: number }) => (p.credits > 0 ? p.priceGel / p.credits : Infinity);

/** Why a package may not be sold (empty: it may). */
export function packageProblems(p: { id: string; priceGel: number; credits: number }, floorGel = MARGIN_ECON.floorCreditGel): string[] {
  const out: string[] = [];
  if (p.priceGel === 0) return out; // the free trial is a marketing cost, capped at sign-up (see doc §5)
  if (!(p.credits > 0)) out.push(`${p.id}: credits must be > 0`);
  if (creditGelOf(p) < floorGel - 1e-9) out.push(`${p.id}: sells a credit at ${creditGelOf(p).toFixed(4)} ₾, under the ${floorGel} ₾ floor (would break 65 %)`);
  if (p.priceGel > BOG_LIMITS_GEL.singleTransaction) out.push(`${p.id}: ${p.priceGel} ₾ is over BOG's ${BOG_LIMITS_GEL.singleTransaction} ₾ single-payment limit`);
  return out;
}

export function allPackageProblems(): string[] {
  return [...PLANS, ...TOPUPS].flatMap((p) => packageProblems(p));
}

/** "What you get" lines for a plan, computed from the price list, e.g. Pro → 23 eight-second videos OR 193 images. */
export interface WhatYouGet {
  videos8s720: number;
  images1k: number;
  songs: number;
  avatarMinutes: number;
  ttsMinutes: number;
}

export function whatYouGet(credits: number): WhatYouGet {
  const n = (id: string) => Math.floor(credits / priceOf(id).credits);
  return {
    videos8s720: n('video.omni.720p.8s'),
    images1k: n('image.1k'),
    songs: n('music.song'),
    avatarMinutes: n('live.avatar.minute'),
    ttsMinutes: n('voice.tts.minute'),
  };
}

export const planUsd = (p: { priceGel: number }) => gelToUsd(p.priceGel);
