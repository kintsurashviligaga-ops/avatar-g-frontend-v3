/** @jest-environment node */
/**
 * The price book version a quote signs (lib/agent/media/quoteToken v2). Pinned: a change to any price moves the version,
 * which refuses every quote shown before the deploy, so it must be a deliberate, reviewed line here.
 */
import { PRICE_TABLES, PRICING_VERSION, pricingVersionOf } from './pricingVersion';

test('today\'s price book version (update this line, deliberately, when a price changes)', () => {
  expect(PRICING_VERSION).toBe('p1-e3ecbaf70472');
});

test('any changed number changes the version; key order does not', () => {
  const moved = { ...PRICE_TABLES, PRICE_BOOK: { ...PRICE_TABLES.PRICE_BOOK, image: PRICE_TABLES.PRICE_BOOK.image + 1 } };
  expect(pricingVersionOf(moved)).not.toBe(PRICING_VERSION);
  const nested = { ...PRICE_TABLES, PRICE_BOOK: { ...PRICE_TABLES.PRICE_BOOK, music: { ...PRICE_TABLES.PRICE_BOOK.music, under60: 4 } } };
  expect(pricingVersionOf(nested)).not.toBe(PRICING_VERSION);
  const reordered = Object.fromEntries(Object.entries(PRICE_TABLES).reverse());
  expect(pricingVersionOf(reordered)).toBe(PRICING_VERSION);
});
