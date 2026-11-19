/**
 * lib/music/producer/price.ts — what a Music Producer action costs in credits. Pure, client-safe.
 *
 * Two books, picked by the caller (the route reads NEXT_PUBLIC_PRICING_V8, as lib/image/artDirector/price does):
 *  - TODAY: the live price book (lib/credits/priceBook musicCredits): 30 s ✦3, a Pro track ✦6.
 *  - V8 (the 65 % rule, draft #343; GG 2026-11-15: "30 s = 6, full song = 11"): 30 s ✦6, any Pro length ✦11.
 *
 * WHY 1 MIN AND 3 MIN COST THE SAME: Google bills Lyria 3 Pro per song ($0.08), not per second, and Lyria 3 Clip per clip
 * ($0.04). Full cost per action, with #343's 5 % retry share, the lyrics/brief text call and hosting:
 *   clip $0.0501 → ⌈5.23⌉ = 6 credits at the 0.08 ₾ floor = 69.5 % gross margin
 *   pro  $0.0977 → ⌈10.19⌉ = 11 credits                      = 67.6 % gross margin
 * The margin gate (econ.enforceMargin from #343, once the wiring PR lands) is handed the full cost and may only RAISE.
 */
import { musicCredits } from '@/lib/credits/priceBook';
import { modelFor, type ProducerLength } from './spec';

export type ProducerBook = 'today' | 'v8';
export type ProducerAction = 'generate' | 'extend' | 'restyle';

export const PRODUCER_COST_USD = { clip: 0.0501, pro: 0.0977 } as const;
export const V8_MUSIC_CREDITS = { clip: 6, pro: 11 } as const;

export type MarginGate = (credits: number, costUsd: number) => { credits: number; raised: boolean };
const noGate: MarginGate = (credits) => ({ credits, raised: false });

export interface ProducerQuote { action: ProducerAction; model: 'clip' | 'pro'; credits: number; costUsd: number }

/**
 * Credits for one action. `lengthSec` is what is MADE: for an extend that is always 30 s (one more clip), for a restyle
 * the length of the track being restyled.
 */
export function quoteProducer(action: ProducerAction, lengthSec: ProducerLength, book: ProducerBook, gate: MarginGate = noGate): ProducerQuote {
  const model = action === 'extend' ? 'clip' : modelFor(lengthSec);
  const costUsd = PRODUCER_COST_USD[model];
  if (book === 'today') return { action, model, credits: musicCredits(model === 'clip' ? 30 : lengthSec), costUsd };
  return { action, model, credits: gate(V8_MUSIC_CREDITS[model], costUsd).credits, costUsd };
}

/** The chips' prices, in panel order. */
export const lengthPrices = (book: ProducerBook, lengths: readonly ProducerLength[]): Array<{ lengthSec: ProducerLength; credits: number }> =>
  lengths.map((l) => ({ lengthSec: l, credits: quoteProducer('generate', l, book).credits }));
