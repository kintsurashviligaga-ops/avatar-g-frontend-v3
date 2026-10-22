/**
 * lib/credits/pricingVersion.ts — which price book a quote was priced from (MASTER TASK v3.1, audit F-06). Server only.
 *
 * A signed quote carries this version, and the run refuses a quote whose version is not today's: a price that changed
 * after the quote was shown is not what the user said yes to. The version is a digest of every table a button's price
 * is computed from (lib/credits/quote and the functions it calls), so it moves by itself when any number moves, and
 * pricingVersion.test.ts pins today's value so a price change is a visible line in review.
 *
 * A caller's own flat price (the free montage, edit and audio extraction) is not in here; each run re-derives its
 * credits and refuses a mismatch as well.
 */
import { createHash } from 'node:crypto';
import { PRICE_BOOK } from './priceBook';
import { CREDIT_COSTS, CREDIT_VALUE_GEL } from './pricing';
import { MUSIC_VIDEO_MULT, STUDIO_DEFAULT_VEO_TIER, VIDEO_CREDITS_PER_SEC, VIDEO_QUALITY_MULT } from './videoPricing';
import { PRODUCT_AD_LENGTHS, PRODUCT_AD_PRICING } from './quote';

/** JSON with object keys in a fixed order, so the digest depends only on the numbers. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** `p1-` and the first 12 hex digits of the tables' SHA-256. Exported for the test that a changed number changes it. */
export function pricingVersionOf(tables: unknown): string {
  return `p1-${createHash('sha256').update(canonical(tables)).digest('hex').slice(0, 12)}`;
}

/** The tables every quoted price reads today. */
export const PRICE_TABLES = {
  PRICE_BOOK,
  CREDIT_COSTS,
  CREDIT_VALUE_GEL,
  STUDIO_DEFAULT_VEO_TIER,
  VIDEO_CREDITS_PER_SEC,
  VIDEO_QUALITY_MULT,
  MUSIC_VIDEO_MULT,
  PRODUCT_AD_LENGTHS,
  PRODUCT_AD_PRICING,
} as const;

export const PRICING_VERSION = pricingVersionOf(PRICE_TABLES);
