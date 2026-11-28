/**
 * Phase 8.25 — the credits sheet with NEXT_PUBLIC_PRICING_V8 on: the four v8 plans (Creator included, Pro at 129 ₾ with
 * Pro's own numbers), "or" between what-you-get lines, four top-up packs with their bonus, and no old card price.
 * The flag is read when the modules load, so it is set first and the component is required after.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

process.env.NEXT_PUBLIC_PRICING_V8 = '1';

const mockNavigate = jest.fn();
jest.mock('../../lib/billing/bogCheckoutClient', () => ({
  ...jest.requireActual('../../lib/billing/bogCheckoutClient'),
  navigateToPayment: (url: string) => mockNavigate(url),
}));
jest.mock('../../lib/analytics/track', () => ({ track: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CreditsModal } = require('./CreditsModal') as typeof import('./CreditsModal');

const calls: Array<{ url: string; init?: RequestInit }> = [];
let caps: unknown = { bog: true, stripe: true };

beforeEach(() => {
  calls.length = 0;
  caps = { bog: true, stripe: true };
  const routes: Record<string, () => unknown> = {
    '/api/profile/onboarding': () => ({ state: { freeFilmsRemaining: 1 } }),
    '/api/checkout/capabilities': () => caps,
    '/api/billing/bog/subscription': () => ({ plan: null }),
    '/api/billing/bog/checkout': () => ({ redirectUrl: 'https://payment.bog.ge/?order_id=bog-1', orderId: 'myavatar-plan-0123456789abcdef', autoRenew: true }),
  };
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const h = routes[url];
    return { ok: Boolean(h), status: h ? 200 : 404, json: async () => (h ? h() : {}) } as never;
  }) as unknown as typeof fetch;
});

const renderModal = (locale = 'en') =>
  render(<CreditsModal open locale={locale} balanceGel={120} authed onClose={jest.fn()} onSignIn={jest.fn()} />);

test('four v8 plans with their own ₾, $, credits and "or" lines', async () => {
  renderModal();
  expect(await screen.findByText('Subscribe · 25 ₾ / mo')).toBeTruthy();
  expect(screen.getByText('Subscribe · 55 ₾ / mo')).toBeTruthy();
  expect(screen.getByText('Subscribe · 129 ₾ / mo')).toBeTruthy();
  expect(screen.getByText('Subscribe · 299 ₾ / mo')).toBeTruthy();
  expect(screen.getByText('Creator')).toBeTruthy();
  expect(screen.getByText('≈ $47.78')).toBeTruthy(); // 129 ₾ / 2.7
  expect(screen.getByText('1550 credits every month')).toBeTruthy();
  const pro = screen.getByTestId('v8-gets-pro');
  expect(pro.textContent).toBe('23 videos (8 s, 720p)or 193 images (1K)or 140 songs');
  expect(document.body.textContent).not.toContain('Veo 3.1'); // today's tier bullets are gone
});

test('Creator subscribes through BOG with the creator tier', async () => {
  renderModal();
  fireEvent.click(await screen.findByText('Subscribe · 55 ₾ / mo'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('https://payment.bog.ge/?order_id=bog-1'));
  const body = JSON.parse(String(calls.find((c) => c.url === '/api/billing/bog/checkout')?.init?.body));
  expect(body).toEqual({ kind: 'plan', tierId: 'creator', locale: 'en' });
});

test('four top-up packs in a 2×2 grid, with the bonus under each pack that has one', async () => {
  renderModal('ka');
  expect(await screen.findByLabelText('100 ₾ — 1100 კრედიტი')).toBeTruthy();
  const bonuses = screen.getAllByTestId('topup-bonus').map((n) => n.textContent);
  expect(bonuses).toEqual(['+10 ბონუსი', '+40 ბონუსი', '+100 ბონუსი']);
  expect(screen.getByLabelText('10 ₾ — 100 კრედიტი').parentElement?.className).toContain('grid-cols-2');
});

test('without BOG plans, v8 never falls back to the old card price', async () => {
  caps = { bog: false, stripe: true, bogPlans: false };
  renderModal();
  const btn = (await screen.findByText('Subscribe · 129 ₾ / mo')).closest('button')!;
  await waitFor(() => expect(btn.hasAttribute('disabled')).toBe(true));
  fireEvent.click(btn);
  expect(calls.some((c) => c.url === '/api/billing/tier-checkout')).toBe(false);
});
