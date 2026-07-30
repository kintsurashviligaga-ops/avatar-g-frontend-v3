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
jest.mock('../lib/i18n/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k, language: 'ka' }),
}));

// eslint-disable-next-line import/first
import { PricingSection } from './PricingSection';
// eslint-disable-next-line import/first
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';

describe('PricingSection — SSoT pin', () => {
  it('renders the four USD tiers with their exact marketing quotas', () => {
    const { container } = render(<PricingSection />);
    const text = container.textContent || '';
    for (const expected of [
      '$0', '$19.99', '$39.99', '$79.99',
      '4 ვიდეო', '10 მუსიკის ტრეკი', '40 სთორიბორდ სურათი',
      '8 ვიდეო', '25 მუსიკის ტრეკი', '100 სთორიბორდ სურათი',
      '16 ვიდეო', '50 მუსიკის ტრეკი', '200 სთორიბორდ სურათი',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('shows no per-item tetri ("თეთრი") cost labels', () => {
    const { container } = render(<PricingSection />);
    expect(container.textContent || '').not.toMatch(/თეთრი/);
  });

  it('is bound to the PRICING_TIERS source of truth', () => {
    expect(PRICING_TIERS.map((t) => t.priceUsd)).toEqual([0, 19.99, 39.99, 79.99]);
    expect(PRICING_TIERS.map((t) => t.creditCeiling)).toEqual([
      { videos: 0, music: 0, images: 6 },
      { videos: 4, music: 10, images: 40 },
      { videos: 8, music: 25, images: 100 },
      { videos: 16, music: 50, images: 200 },
    ]);
  });
});
