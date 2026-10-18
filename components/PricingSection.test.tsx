/**
 * PricingSection — SSoT pin (Stage-2 V3-F2).
 *
 * Locks the live pricing page to the single source of truth (PRICING_TIERS: the 4-tier
 * ladder — Free $0 / Basic $19.99 / Pro $39.99 / Business $79.99)
 * with the exact marketing quotas, and proves NO per-item "tetri" cost labels leak into the DOM.
 * If anyone edits the tiers or reintroduces a per-item cost grid, this goes red.
 *
 * Deliberately setup-free: uses only core Jest matchers (no @testing-library/jest-dom
 * global is configured) and stubs IntersectionObserver, which framer-motion's
 * `whileInView` needs and jsdom does not provide.
 */
import { render } from '@testing-library/react';

// framer-motion's whileInView observes via IntersectionObserver (absent in jsdom).
// A no-op stub keeps the element mounted (content stays in the DOM to assert on).
class IOStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() { return []; }
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(global as any).IntersectionObserver = (global as any).IntersectionObserver || IOStub;

// The section reads i18n via useLanguage(); return a passthrough so the test does
// not depend on i18n internals. The tier NUMBERS come from PRICING_TIERS, not t().
// Mock via the RELATIVE path: it resolves to the same module the component imports
// as '@/lib/i18n/LanguageContext', but jest.mock's path registration doesn't honor
// the '@/' moduleNameMapper alias in this setup (real imports do).
let mockLanguage = 'ka';
jest.mock('../lib/i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: mockLanguage }),
}));
afterEach(() => { mockLanguage = 'ka'; });

// eslint-disable-next-line import/first
import { PricingSection } from './PricingSection';
// eslint-disable-next-line import/first
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';

describe('PricingSection — SSoT pin', () => {
  it('renders the four tiers with their exact marketing quotas, lari first on the Georgian page', () => {
    const { container } = render(<PricingSection />);
    const text = container.textContent || '';
    for (const expected of [
      // PRD v2 §1.2: the Georgian page leads with the ₾ the BOG checkout charges; the dollar figure is for reference.
      '0 ₾', '54 ₾', '108 ₾', '216 ₾', '≈ $19.99', '≈ $39.99', '≈ $79.99', 'არჩევა · 54 ₾',
      // Free is the 50-credit trial plus ONE free film from its own quota (the ceiling's one video): 5 tracks and
      // 7 images on the credits (lib/billing/tiers).
      '1 ვიდეო', '5 მუსიკის ტრეკი', '7 სთორიბორდ სურათი', '50 კრედიტი შედის',
      // Each paid plan sells its credits at the top-up rate, 10 per ₾ (PRD v2 §1.1, "exactly 2×"), and its ceiling is
      // exactly what those credits buy at the price book's prices.
      '4 ვიდეო', '20 მუსიკის ტრეკი', '36 სთორიბორდ სურათი', '540 კრედიტი შედის',
      '8 ვიდეო', '40 მუსიკის ტრეკი', '72 სთორიბორდ სურათი', '1,080 კრედიტი შედის',
      '16 ვიდეო', '80 მუსიკის ტრეკი', '144 სთორიბორდ სურათი', '2,160 კრედიტი შედის',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('English leads with the dollar price and keeps the lari for reference', () => {
    mockLanguage = 'en';
    const { container } = render(<PricingSection />);
    const text = container.textContent || '';
    for (const expected of ['$0', '$19.99', '$39.99', '$79.99', '≈ 54 ₾', 'Choose · $19.99']) expect(text).toContain(expected);
  });

  it('shows no per-item tetri ("თეთრი") cost labels', () => {
    const { container } = render(<PricingSection />);
    expect(container.textContent || '').not.toMatch(/თეთრი/);
  });

  it('is bound to the PRICING_TIERS source of truth', () => {
    expect(PRICING_TIERS.map((t) => t.priceUsd)).toEqual([0, 19.99, 39.99, 79.99]);
    expect(PRICING_TIERS.map((t) => t.creditCeiling)).toEqual([
      { videos: 1, music: 5, images: 7 },
      { videos: 4, music: 20, images: 36 },
      { videos: 8, music: 40, images: 72 },
      { videos: 16, music: 80, images: 144 },
    ]);
    expect(PRICING_TIERS.map((t) => t.creditsIncluded)).toEqual([50, 540, 1080, 2160]);
  });
});
