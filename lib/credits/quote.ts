/**
 * lib/credits/quote.ts — the price of ONE press of a Generate button, in credits. Pure, client-safe.
 *
 * ⚠️ THE NUMBER ON THE BUTTON MUST BE THE NUMBER ON THE BILL. Every tool's quote is built from the same functions its
 * server route charges with (creditCostFor for image / music / avatar / remix / 3D; videoCredits for films), and
 * lib/credits/quote.test.ts pins the pairing. A new paid tool adds its line HERE and charges through the same
 * function — never a literal on the button.
 */
import { creditCostFor } from './pricing';
import { videoCredits, type VideoMode, type VideoQuality } from './videoPricing';

export type QuoteTool = 'image' | 'video' | 'music' | 'avatar' | 'remix' | 'swap' | 'motion' | 'product' | 'model3d' | 'chat';

export interface QuoteInput {
  tool: QuoteTool;
  /** Images per press (image tool). */
  count?: number;
  /** Film length (video) or track length (music), in seconds. */
  seconds?: number;
  quality?: VideoQuality;
  mode?: VideoMode;
}

/** Seconds a product ad is billed as (one 6 s Kling clip — /api/video/remix `productad`). */
export const PRODUCT_AD_SECONDS = 6;

/** Credits one press costs; 0 for a free action (chat). */
export function quoteCredits(q: QuoteInput): number {
  switch (q.tool) {
    case 'image':
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
      return creditCostFor('video', { seconds: PRODUCT_AD_SECONDS });
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
