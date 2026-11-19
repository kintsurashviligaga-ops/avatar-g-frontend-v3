/**
 * lib/image/artDirector/price.ts — what one Art Director image costs in credits. Pure, client-safe.
 *
 * Two books, picked by the caller (the route reads NEXT_PUBLIC_PRICING_V8 the same way lib/credits/priceBook does):
 *  - TODAY: PRICE_BOOK.image (✦5) per 1K image. 2K and 4K are not sold today (null = the chip is hidden).
 *  - V8 (GG-approved 65 % rule, draft #343): 1K ✦8 (catalog image.1k), 2K ✦12, 4K ✦17 (image.2k / image.4k were
 *    "null" in the approved list; computed by priceOf() with the same engine on 2026-11-15, 2K needs GG's OK).
 *
 * Every image is one call, so a grid of 4 is 4 × the image price, an upscale is a new image at its target size, and an
 * edit is priced like a new image of the same size (cogs image.edit.1k = ✦8, same as image.1k).
 *
 * References add input tokens (~1,120 per picture at $0.50 / 1M ≈ $0.00056). The v8 pricer takes a margin gate
 * (econ.enforceMargin from #343 once the wiring PR lands): it is handed the job's full cost and may only RAISE the price.
 */
import { PRICE_BOOK } from '@/lib/credits/priceBook';
import type { ArtSize } from './spec';

export type ArtBook = 'today' | 'v8';

/** Full cost of one image incl. retries + hosting, USD (lib/billing/margin/cogs, draft #343). */
export const IMAGE_COST_USD: Readonly<Record<ArtSize, number>> = { '1K': 0.0715, '2K': 0.108, '4K': 0.1622 };
/** Input tokens of one reference picture, USD. */
export const REF_INPUT_USD = (1_120 * 0.5) / 1_000_000;

export const V8_IMAGE_CREDITS: Readonly<Record<ArtSize, number>> = { '1K': 8, '2K': 12, '4K': 17 };

export type MarginGate = (credits: number, costUsd: number) => { credits: number; raised: boolean };
const noGate: MarginGate = (credits) => ({ credits, raised: false });

export interface ArtPriceInput { size: ArtSize; references: number; book: ArtBook }

/** Credits for ONE image, or null when that size is not sold in that book. */
export function imageCredits(q: ArtPriceInput, gate: MarginGate = noGate): number | null {
  if (q.book === 'today') return q.size === '1K' ? PRICE_BOOK.image : null;
  const base = V8_IMAGE_CREDITS[q.size];
  const cost = IMAGE_COST_USD[q.size] + Math.max(0, q.references) * REF_INPUT_USD;
  return gate(base, cost).credits;
}

export interface ArtQuote { perImage: number; count: number; total: number }

/** The total for `count` images (a grid), or null when the size is not sold. */
export function quoteArt(q: ArtPriceInput & { count: number }, gate: MarginGate = noGate): ArtQuote | null {
  const perImage = imageCredits(q, gate);
  if (perImage == null) return null;
  return { perImage, count: q.count, total: perImage * q.count };
}

/** Sizes the panel may offer in a book (a size with no price is never shown). */
export function sizesFor(book: ArtBook): ArtSize[] {
  return (['1K', '2K', '4K'] as const).filter((s) => imageCredits({ size: s, references: 0, book }) != null);
}

/**
 * Which book is live. Same switch and spelling as pricingV8Active in the v8 wiring PR (#351): NEXT_PUBLIC_PRICING_V8 =
 * on | 1 | true. Read literally from process.env so Next inlines it on the client too.
 */
export function artBook(value: string | undefined = process.env.NEXT_PUBLIC_PRICING_V8): ArtBook {
  const v = (value ?? '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true' ? 'v8' : 'today';
}
