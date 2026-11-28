/**
 * lib/billing/v8/sheet.ts — Phase 8.25. What the credits sheet (CreditsModal) and the payment-return toast show under
 * NEXT_PUBLIC_PRICING_V8. Pure copy and numbers, no BOG calls.
 *
 * LITERALS on purpose, like margin/bogV8: this runs in the browser, and importing margin/packages would pull the whole
 * margin engine into the bundle. sheet.test holds every number here equal to PLANS / whatYouGet / gelToUsd, so the two
 * cannot drift.
 */
import { BOG_PLAN_OFFERS_V8, BOG_TOPUPS_V8, walletBookedCredits, type BogPlanOfferV8 } from '@/lib/billing/margin/bogV8';

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

/** $1 = 2.7 ₾, as margin/econ. */
export const V8_GEL_PER_USD = 2.7;

const NAMES: Record<string, Record<Lang, string>> = {
  start: { ka: 'სტარტი', en: 'Start', ru: 'Старт' },
  creator: { ka: 'კრეატორი', en: 'Creator', ru: 'Креатор' },
  pro: { ka: 'პრო', en: 'Pro', ru: 'Про' },
  business: { ka: 'ბიზნესი', en: 'Business', ru: 'Бизнес' },
};

/** whatYouGet(plan.credits) per plan: 8 s 720p videos, 1K images, songs. */
const GETS: Record<string, { videos: number; images: number; songs: number }> = {
  start: { videos: 4, images: 35, songs: 25 },
  creator: { videos: 9, images: 81, songs: 59 },
  pro: { videos: 23, images: 193, songs: 140 },
  business: { videos: 56, images: 462, songs: 336 },
};

export interface V8SheetPlan extends BogPlanOfferV8 {
  name: string;
  usd: string;
  /** "23 videos (8 s)", "or 193 images", "or 140 songs". */
  gets: string[];
  popular: boolean;
}

export function v8SheetPlans(locale: string): V8SheetPlan[] {
  const l = lang(locale);
  const or = { ka: 'ან', en: 'or', ru: 'или' }[l];
  return BOG_PLAN_OFFERS_V8.map((o) => {
    const g = GETS[o.planId] ?? { videos: 0, images: 0, songs: 0 };
    const lines = [
      { ka: `${g.videos} ვიდეო (8 წმ, 720p)`, en: `${g.videos} videos (8 s, 720p)`, ru: `${g.videos} видео (8 с, 720p)` }[l],
      { ka: `${g.images} სურათი (1K)`, en: `${g.images} images (1K)`, ru: `${g.images} изображений (1K)` }[l],
      { ka: `${g.songs} სიმღერა`, en: `${g.songs} songs`, ru: `${g.songs} песен` }[l],
    ];
    return {
      ...o,
      name: NAMES[o.planId]?.[l] ?? o.planId,
      usd: (o.amountGel / V8_GEL_PER_USD).toFixed(2),
      gets: lines.map((s, i) => (i === 0 ? s : `${or} ${s}`)),
      popular: o.planId === 'pro',
    };
  });
}

/** A v8 pack split into the base (10 per ₾) and the bonus on top. */
export function v8TopupSplit(amountGel: number): { base: number; bonus: number; total: number } {
  const base = walletBookedCredits(amountGel);
  const pack = BOG_TOPUPS_V8.find((t) => Math.abs(t.amountGel - amountGel) < 0.005);
  const total = pack ? pack.credits : base;
  return { base, bonus: Math.max(0, total - base), total };
}

/** "+100 ბონუსი" under a pack, '' when there is none. */
export function v8BonusLabel(amountGel: number, locale: string): string {
  const { bonus } = v8TopupSplit(amountGel);
  if (bonus <= 0) return '';
  return `+${bonus} ${{ ka: 'ბონუსი', en: 'bonus', ru: 'бонус' }[lang(locale)]}`;
}

/**
 * The return toast for a completed v8 top-up. The order API reports what credit_wallet_gel booked (floor(amount × 10)),
 * not the bonus that is granted next to it, so a 100 ₾ pack read "1000 credits added" while the customer gets 1,100.
 * Returns null when the booked number is not a v8 pack with a bonus (the caller keeps its own text).
 */
export function v8TopupSuccessText(bookedCredits: number, locale: string): string | null {
  const pack = BOG_TOPUPS_V8.find((t) => walletBookedCredits(t.amountGel) === bookedCredits);
  if (!pack) return null;
  const { base, bonus, total } = v8TopupSplit(pack.amountGel);
  if (bonus <= 0) return null;
  const f = (n: number) => n.toLocaleString('en-US');
  return {
    ka: `გადახდა მიღებულია — დაემატა ${f(total)} კრედიტი (${f(base)} + ${f(bonus)} ბონუსი).`,
    en: `Payment received — ${f(total)} credits added (${f(base)} + ${f(bonus)} bonus).`,
    ru: `Оплата получена — начислено ${f(total)} кредитов (${f(base)} + ${f(bonus)} бонус).`,
  }[lang(locale)];
}
