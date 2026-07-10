/**
 * PricingSection — SSoT pin (Stage-2 V3-F2).
 *
 * Locks the live pricing page to the single source of truth (PRICING_TIERS:
 * Starter 38 / Pro Creator 299 / Studio Annual 899 GEL) with the exact marketing
 * quotas, and proves NO per-item "tetri" cost labels leak back into the DOM.
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
  it('renders the 38/299/899 tiers with their exact marketing quotas', () => {
    const { container } = render(<PricingSection />);
    const text = container.textContent || '';
    for (const expected of [
      '38₾', '299₾', '899₾',
      '2 ვიდეო', '10 მუსიკის ტრეკი', '20 სთორიბორდ სურათი',
      '10 ვიდეო', '50 მუსიკის ტრეკი', '100 სთორიბორდ სურათი',
      '40 ვიდეო', '250 მუსიკის ტრეკი', '500 სთორიბორდ სურათი',
    ]) {
      expect(text).toContain(expected);
    }
  });

  it('shows no per-item tetri ("თეთრი") cost labels', () => {
    const { container } = render(<PricingSection />);
    expect(container.textContent || '').not.toMatch(/თეთრი/);
  });

  it('is bound to the PRICING_TIERS source of truth', () => {
    expect(PRICING_TIERS.map((t) => t.priceGel)).toEqual([38, 299, 899]);
    expect(PRICING_TIERS.map((t) => t.creditCeiling)).toEqual([
      { videos: 2, music: 10, images: 20 },
      { videos: 10, music: 50, images: 100 },
      { videos: 40, music: 250, images: 500 },
    ]);
  });
});
