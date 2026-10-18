/**
 * lib/credits/quote.ts — the price of ONE press of a Generate button, in credits. Pure, client-safe.
 *
 * ⚠️ THE NUMBER ON THE BUTTON MUST BE THE NUMBER ON THE BILL. Every tool's quote is built from the same functions its
 * server route charges with (creditCostFor for image / music / avatar / remix / 3D; videoCredits for films), and
 * lib/credits/quote.test.ts pins the pairing. A new paid tool adds its line HERE and charges through the same
 * function — never a literal on the button.
 */
import { creditCostFor } from './pricing';
import { STUDIO_DEFAULT_VEO_TIER, videoCredits, type VideoMode, type VideoQuality } from './videoPricing';
import { genjutsuCredits } from '@/lib/genjutsu/pricing';

export type QuoteTool = 'image' | 'video' | 'music' | 'avatar' | 'remix' | 'swap' | 'motion' | 'product' | 'model3d' | 'chat' | 'interior' | 'photoshoot' | 'vfx';

export interface QuoteInput {
  tool: QuoteTool;
  /** Images per press (image tool) — for the Interior designer / Photographer, the RENDERS of the press (photos × renders each). */
  count?: number;
  /** Film length (video), ad length (product) or track length (music), in seconds. */
  seconds?: number;
  quality?: VideoQuality;
  mode?: VideoMode;
}

/** The lengths the Product Ad tool offers: one 8 s Veo clip, or three / six of them on the film's 8 s grid. */
export const PRODUCT_AD_LENGTHS = [8, 24, 48] as const;

/**
 * Which price a product ad charges.
 *
 * - `length` (live): an ad costs what a Fast film of its length costs (lib/credits/priceBook — 75 / 217 / 430 at 8 / 24 / 48 s),
 *   since a 48 s ad renders six Veo Fast clips. The owner's 100 %-profit rule (PRD v2 §1.1, 2026-10-18).
 * - `production`: the flat 8 s video price (creditCostFor('video') without a length) whatever the ad's length, which sold a 48 s ad — six
 *   clips, ~20 ₾ of cost — for one clip's price. Kept so the switch can be read back in tests and the doc.
 *
 * The button, the chat notices, the remix route's charge and the secondary-clip gate all read this one switch.
 */
export type ProductAdPricing = 'production' | 'length';
export const PRODUCT_AD_PRICING: ProductAdPricing = 'length';

/** Credits a product ad of `sec` seconds costs under `rule`. */
export function productAdCredits(sec: number | null | undefined, rule: ProductAdPricing = PRODUCT_AD_PRICING): number {
  const seconds = productAdSeconds(sec);
  return rule === 'length'
    ? videoCredits({ seconds, quality: STUDIO_DEFAULT_VEO_TIER })
    : creditCostFor('video');
}

/** A requested ad length rounded UP to the next offered one (8 s when absent), so a request never pays for less than it renders. */
export function productAdSeconds(sec?: number | null): number {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return PRODUCT_AD_LENGTHS[0];
  return PRODUCT_AD_LENGTHS.find((len) => n <= len) ?? Math.max(...PRODUCT_AD_LENGTHS);
}

/** Credits one press costs; 0 for a free action (chat). */
export function quoteCredits(q: QuoteInput): number {
  switch (q.tool) {
    case 'image':
    // The Interior designer and the Photographer render through /api/nanobanana/image — one render, one image's price
    // (lib/studio/shootQuote.ts builds `count` from photos × renders each; the route reserves creditCostFor('image') per render).
    case 'interior':
    case 'photoshoot':
      return creditCostFor('image', { count: q.count });
    case 'video':
      return videoCredits({ seconds: q.seconds ?? 8, quality: q.quality, mode: q.mode });
    case 'music':
      return creditCostFor('music', { seconds: q.seconds });
    case 'avatar':
      return creditCostFor('avatar');
    case 'remix':
    case 'swap':
    case 'motion':
      return creditCostFor('remix');
    case 'product':
      return productAdCredits(q.seconds);
    case 'model3d':
      return creditCostFor('model3d');
    // A VFX scene is one 8 s Veo clip: the SAME function the VFX button shows and /api/genjutsu/generate charges with.
    // It used to be quoted as `remix` (the catalog's R5 gap), a number the VFX route never charges.
    case 'vfx':
      return genjutsuCredits({ op: 'scene', quality: q.quality === 'standard' ? 'standard' : 'fast' }) ?? 0;
    case 'chat':
    default:
      return 0;
  }
}

/**
 * One Motion Control press: the Kling render (/api/motion-control reserves creditCostFor('remix')), plus the lip-sync
 * pass's own reservation when lip-sync speaks typed text (/api/video/lipsync reserves creditCostFor('avatar')).
 */
export function motionCredits({ lipsync = false }: { lipsync?: boolean } = {}): number {
  return quoteCredits({ tool: 'motion' }) + (lipsync ? quoteCredits({ tool: 'avatar' }) : 0);
}

type Lang = 'ka' | 'en' | 'ru';
const lang = (l: string | null | undefined): Lang => (l === 'en' || l === 'ru' ? l : 'ka');

/** "25 credits" / "25 კრედიტი" / "25 кредитов" — with the right Russian plural. */
export function creditsLabel(n: number, locale: string = 'en'): string {
  const l = lang(locale);
  if (l === 'en') return `${n} ${n === 1 ? 'credit' : 'credits'}`;
  if (l === 'ka') return `${n} კრედიტი`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word = mod10 === 1 && mod100 !== 11 ? 'кредит' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'кредита' : 'кредитов';
  return `${n} ${word}`;
}
