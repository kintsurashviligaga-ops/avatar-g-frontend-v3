/**
 * CreditsModal — the billing surface, rendered for real (jsdom) with every request answered by a fake router.
 * The navigation to the bank goes through navigateToPayment, which is watched instead of performed.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const mockNavigate = jest.fn();
jest.mock('../../lib/billing/bogCheckoutClient', () => ({
  ...jest.requireActual('../../lib/billing/bogCheckoutClient'),
  navigateToPayment: (url: string) => mockNavigate(url),
}));
jest.mock('../../lib/analytics/track', () => ({ track: jest.fn() }));

import { CreditsModal } from './CreditsModal';

type Handler = (init?: RequestInit) => { status?: number; body?: unknown };
let routes: Record<string, Handler> = {};
const calls: Array<{ url: string; init?: RequestInit }> = [];

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  routes = {
    '/api/profile/onboarding': () => ({ body: { state: { freeFilmsRemaining: 1 } } }),
    '/api/checkout/capabilities': () => ({ body: { bog: true, stripe: true } }),
    '/api/billing/bog/subscription': () => ({ body: { plan: null } }),
    '/api/billing/bog/checkout': () => ({ body: { redirectUrl: 'https://payment.bog.ge/?order_id=bog-1', orderId: 'myavatar-plan-0123456789abcdef', autoRenew: true } }),
  };
  global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const h = routes[url];
    const r = h ? h(init) : { status: 404, body: {} };
    // jsdom has no Response — the component only reads ok / status / json().
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.body ?? {} } as never;
  }) as unknown as typeof fetch;
});

const renderModal = (authed = true) =>
  render(<CreditsModal open locale="en" balanceGel={120} authed={authed} onClose={jest.fn()} onSignIn={jest.fn()} />);
const bogBody = (url: string) => JSON.parse(String(calls.find((c) => c.url === url)?.init?.body ?? '{}'));

test('signed out → the sign-in gate, no billing requests', () => {
  renderModal(false);
  expect(screen.getByText('Please sign in first')).toBeTruthy();
  expect(calls.some((c) => c.url === '/api/checkout/capabilities')).toBe(false);
});

test('with BOG live: plans priced in the ₾ BOG charges, PAYG packs, BOG footer — and no "Stripe" anywhere', async () => {
  renderModal();
  expect(await screen.findByText('Subscribe · 108 ₾ / mo')).toBeTruthy();
  expect(screen.getByText('Subscribe · 54 ₾ / mo')).toBeTruthy();
  expect(screen.getByText('Subscribe · 216 ₾ / mo')).toBeTruthy();
  expect(screen.getByText('≈ $39.99')).toBeTruthy();
  expect(screen.getByText('525 credits every month')).toBeTruthy();
  expect(screen.getByLabelText('20 ₾ — 200 credits')).toBeTruthy();
  expect(screen.getByText('Secure payment by Bank of Georgia (₾)')).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/stripe/i);
});

test('Subscribe → POST /api/billing/bog/checkout {plan, tier, locale}, spinner says where it is going, then the bank', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((r) => { release = r; });
  const original = routes['/api/billing/bog/checkout'];
  global.fetch = ((orig) => jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === '/api/billing/bog/checkout') await gate;
    return orig(input, init);
  }))(global.fetch) as unknown as typeof fetch;
  routes['/api/billing/bog/checkout'] = original;

  renderModal();
  fireEvent.click(await screen.findByText('Subscribe · 108 ₾ / mo'));
  expect(await screen.findByText('Opening Bank of Georgia…')).toBeTruthy();
  await act(async () => { release(); });
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('https://payment.bog.ge/?order_id=bog-1'));
  expect(bogBody('/api/billing/bog/checkout')).toEqual({ kind: 'plan', tierId: 'creator', locale: 'en' });
});

test('a top-up pack → BOG checkout for that amount', async () => {
  renderModal();
  await screen.findByText('Secure payment by Bank of Georgia (₾)'); // rails resolved — the packs are enabled
  fireEvent.click(screen.getByLabelText('50 ₾ — 500 credits'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalled());
  expect(bogBody('/api/billing/bog/checkout')).toEqual({ kind: 'topup', amountGel: 50, locale: 'en' });
});

test('the same plan already live → a friendly toast, no navigation', async () => {
  routes['/api/billing/bog/checkout'] = () => ({ status: 409, body: { error_code: 'BOG_ALREADY_SUBSCRIBED' } });
  renderModal();
  fireEvent.click(await screen.findByText('Subscribe · 54 ₾ / mo'));
  expect(await screen.findByText('This plan is already active.')).toBeTruthy();
  expect(mockNavigate).not.toHaveBeenCalled();
});

test('a live plan: shown with its renewal date and card; its card is "current"; cancelling takes a confirmation', async () => {
  let deleted = false;
  routes['/api/billing/bog/subscription'] = (init) => {
    if (init?.method === 'DELETE') { deleted = true; return { body: { canceled: 1 } }; }
    return { body: { plan: { tier: 'creator', status: 'active', currentPeriodEnd: '2026-11-02T10:00:00Z', autoRenew: !deleted, cardMask: '548888xxxxxx9893', amountGel: 108 } } };
  };
  renderModal();
  expect(await screen.findByText('Your plan')).toBeTruthy();
  expect(screen.getByText(/Renews 2 November · •••• 9893/)).toBeTruthy();
  const current = screen.getByRole('button', { name: /Renews 2 November/ });
  expect((current as HTMLButtonElement).disabled).toBe(true);

  fireEvent.click(screen.getByText('Cancel auto-renewal'));
  expect(screen.getByText(/stays active until 2 November and you won’t be charged again/)).toBeTruthy();
  fireEvent.click(screen.getByText('Yes, cancel'));
  expect(await screen.findByText('Auto-renewal cancelled.')).toBeTruthy();
  expect(deleted).toBe(true);
  await waitFor(() => expect(screen.getAllByText(/Active until 2 November/).length).toBeGreaterThan(0));
});

test('BOG not live: the older card checkout still works, in $ with the ₾ reference', async () => {
  routes['/api/checkout/capabilities'] = () => ({ body: { bog: false, stripe: true } });
  routes['/api/billing/tier-checkout'] = () => ({ body: { url: 'https://checkout.example/session' } });
  renderModal();
  await screen.findByText('Secure card checkout'); // rails resolved
  fireEvent.click(screen.getByText('Pay · $39.99'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('https://checkout.example/session'));
  expect(bogBody('/api/billing/tier-checkout')).toEqual({ tierId: 'pro' });
  expect(calls.some((c) => c.url === '/api/billing/bog/subscription')).toBe(false);
});

test('no rail at all: every pay button disabled, with a plain notice', async () => {
  routes['/api/checkout/capabilities'] = () => ({ body: { bog: false, stripe: false } });
  renderModal();
  expect(await screen.findByText('Payments are temporarily unavailable. Please try again later.')).toBeTruthy();
  const dialog = screen.getByRole('dialog');
  const pay = within(dialog).getAllByRole('button').filter((b) => b.tagName === 'BUTTON' && (/Pay ·|Subscribe/.test(b.textContent ?? '') || /credits/.test(b.getAttribute('aria-label') ?? '')));
  expect(pay.length).toBeGreaterThan(0);
  for (const b of pay) expect((b as HTMLButtonElement).disabled).toBe(true);
});

test('a real dialog: focus moves into it, Tab stays inside, Escape closes it', async () => {
  const onClose = jest.fn();
  render(<CreditsModal open locale="en" balanceGel={120} authed onClose={onClose} onSignIn={jest.fn()} />);
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
  const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled])'));
  focusables[focusables.length - 1]!.focus();
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(dialog.contains(document.activeElement)).toBe(true);
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});
