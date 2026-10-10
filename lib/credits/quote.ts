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

export type QuoteTool = 'image' | 'video' | 'music' | 'avatar' | 'remix' | 'swap' | 'motion' | 'product' | 'model3d' | 'chat' | 'interior' | 'photoshoot';

export interface QuoteInput {
  tool: QuoteTool;
  /** Images per press (image tool) — for the Interior designer / Photographer, the RENDERS of the press (photos × renders each). */
  count?: number;
  /** Film length (video), ad length (product) or track length (music), in seconds. */
  seconds?: number;
  quality?: VideoQuality;
  mode?: VideoMode;
}

/**
 * The lengths the Product Ad tool offers: one 8 s Veo clip, or three / six of them on the film's 8 s grid.
 *
 * ⚠️ THE AD WAS PRICED AS ONE CLIP AT EVERY LENGTH. Button and route both charged 25 credits, while a 48 s ad renders six
 * Veo Fast clips ($5.76 at $0.12/s, ≈ 15.5 ₾) for 2.50 ₾ (pricing audit, 2026-10-10). An ad now costs what a film of the
 * same length costs, on the tier it renders on.
 */
export const PRODUCT_AD_LENGTHS = [8, 24, 48] as const;

/** A requested ad length rounded UP to the next offered one (8 s when absent), so a request never pays for less than it renders. */
export function productAdSeconds(sec?: number | null): number {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) return PRODUCT_AD_LENGTHS[0];
  return PRODUCT_AD_LENGTHS.find((len) => n <= len) ?? PRODUCT_AD_LENGTHS[PRODUCT_AD_LENGTHS.length - 1];
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
      return videoCredits({ seconds: productAdSeconds(q.seconds), quality: STUDIO_DEFAULT_VEO_TIER });
    case 'model3d':
      return creditCostFor('model3d');
    case 'chat':
    default:
      return 0;
  }
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
