/**
 * AuthModal — a paid plan's sign-up says what it costs (owner, PRD v2 §1.2, 2026-10-18).
 *
 * ⚠️ Before: someone who clicked a paid plan on the pricing page landed on a sign-up sheet that read „უფასოა"
 * ("it's free"). The sheet now names the plan, the amount due (₾ first on the Georgian page — what BOG charges) and its
 * credits; a plain sign-up, or the free plan, still says it is free.
 */
import { render, screen } from '@testing-library/react';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }) }));
jest.mock('../../lib/supabase/browser', () => ({ createBrowserClient: jest.fn(), isSupabaseConfigured: () => false }));
jest.mock('../../lib/analytics/track', () => ({ track: jest.fn() }));

import AuthModal from './AuthModal';
import { PRICING_TIERS } from '../../lib/billing/pricingConfig';

const basic = PRICING_TIERS.find((t) => t.id === 'basic')!;
const sub = () => screen.getByTestId('auth-signup-sub').textContent ?? '';
const open = (locale: 'ka' | 'en' | 'ru', plan: string | null) =>
  render(<AuthModal open locale={locale} onClose={() => {}} initialMode="signup" plan={plan} />);

test('a paid plan: the Georgian sheet names the plan, the ₾ amount due and its credits, never „free"', () => {
  open('ka', 'basic');
  expect(sub()).toContain(`${basic.priceGel} ₾`);
  expect(sub()).toContain(String(basic.creditsIncluded));
  expect(sub()).toContain('საბაზისო');
  expect(sub()).not.toContain('უფასო');
});

test('English and Russian lead with the dollar price, still never „free"', () => {
  const { unmount } = open('en', 'pro');
  const pro = PRICING_TIERS.find((t) => t.id === 'pro')!;
  expect(sub()).toContain(`$${pro.priceUsd}`);
  expect(sub()).not.toMatch(/free/i);
  unmount();
  open('ru', 'business');
  expect(sub()).toContain(`$${PRICING_TIERS.find((t) => t.id === 'business')!.priceUsd}`);
  expect(sub()).not.toMatch(/Бесплатно/);
});

test('a plain sign-up, the free plan or an unknown plan still says it is free', () => {
  for (const plan of [null, 'free', 'nonsense']) {
    const { unmount } = open('ka', plan);
    expect(sub()).toMatch(/^უფასოა/);
    unmount();
  }
});
