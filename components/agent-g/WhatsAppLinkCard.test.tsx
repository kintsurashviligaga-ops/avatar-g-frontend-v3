/**
 * @jest-environment jsdom
 *
 * WhatsAppLinkCard — honest states (opening soon / sign in / linked / not linked), the code flow (Get code → Open
 * WhatsApp with `connect CODE` → the card notices the link), the alerts switch and unlink. It never asks for a number.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WhatsAppLinkCard } from './WhatsAppLinkCard';

jest.mock('next/navigation', () => ({ usePathname: () => '/en/settings' }));

type Handler = (init?: RequestInit) => { status?: number; body: unknown };
let routes: Record<string, Handler>;
let fetchMock: jest.Mock;

const state = (s: Record<string, unknown>) => () => ({ body: { status: 'success', data: { guest: false, configured: true, available: true, linked: null, ...s } } });

beforeEach(() => {
  routes = {};
  fetchMock = jest.fn(async (_url: string, init?: RequestInit) => {
    const h = routes[(init?.method ?? 'GET').toUpperCase()];
    const r = h ? h(init) : { status: 404, body: {} };
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body } as Response;
  });
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('keys or tables missing → "temporarily unavailable" and no button', async () => {
  routes.GET = state({ configured: false, available: false });
  render(<WhatsAppLinkCard />);
  expect(await screen.findByTestId('wa-soon')).toHaveTextContent('temporarily unavailable');
  expect(screen.queryByRole('button')).toBeNull();
});

test('a guest is asked to sign in', async () => {
  routes.GET = state({ guest: true });
  render(<WhatsAppLinkCard locale="ka" />);
  expect(await screen.findByTestId('wa-guest')).toHaveTextContent('შედი ანგარიშზე');
});

test('Connect WhatsApp → Open WhatsApp with the command typed in → the card notices the link', async () => {
  jest.useFakeTimers();
  let linked = false;
  routes.GET = () => state(linked ? { linked: { number: '+995 ••• ••111', linked_at: null, alerts: true } } : {})();
  routes.POST = () => ({ status: 201, body: { status: 'success', data: { code: 'ABCD2345', command: 'connect ABCD2345', expires_at: new Date(Date.now() + 900_000).toISOString(), wa_link: 'https://wa.me/995322000000?text=connect%20ABCD2345' } } });

  render(<WhatsAppLinkCard />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
  expect(await screen.findByTestId('wa-command')).toHaveTextContent('connect ABCD2345');
  expect(screen.getByRole('link', { name: /Open WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/995322000000?text=connect%20ABCD2345');
  expect(screen.getByText('Waiting for your message…')).toBeInTheDocument();

  linked = true;
  await act(async () => { jest.advanceTimersByTime(4_100); });
  await waitFor(() => expect(screen.getByTestId('wa-linked')).toHaveTextContent('+995 ••• ••111'));
  expect(screen.queryByTestId('wa-command')).toBeNull();
});

test('a refused code request shows an error and keeps the button', async () => {
  routes.GET = state({});
  routes.POST = () => ({ status: 503, body: { status: 'error' } });
  render(<WhatsAppLinkCard />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Connect WhatsApp' })).toBeInTheDocument();
});

test('linked: the alerts switch PATCHes, and unlink asks first, then DELETEs', async () => {
  let linked = true;
  routes.GET = () => state(linked ? { linked: { number: '+995 ••• ••111', linked_at: null, alerts: true } } : {})();
  routes.PATCH = () => ({ body: { status: 'success', data: { alerts: false } } });
  routes.DELETE = () => { linked = false; return { body: { status: 'success', data: { unlinked: true } } }; };

  render(<WhatsAppLinkCard />);
  const sw = await screen.findByRole('switch', { name: 'WhatsApp alerts' });
  expect(sw).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(sw);
  await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false'));
  const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
  expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({ alerts: false });

  fireEvent.click(screen.getByRole('button', { name: /Disconnect/ }));
  expect(screen.getByText('Disconnect this number?')).toBeInTheDocument();
  fireEvent.click(screen.getAllByRole('button', { name: /Disconnect/ })[0]);
  expect(await screen.findByTestId('wa-unlinked')).toBeInTheDocument();
});

test('a failed alerts change rolls the switch back', async () => {
  routes.GET = state({ linked: { number: '+995 ••• ••111', linked_at: null, alerts: true } });
  routes.PATCH = () => ({ status: 500, body: {} });
  render(<WhatsAppLinkCard />);
  fireEvent.click(await screen.findByRole('switch'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
});

test('embedded (Settings → Connections): no header, no anchor; onChange fires when the link appears and when it goes', async () => {
  jest.useFakeTimers();
  let linked = false;
  routes.GET = () => state(linked ? { linked: { number: '+995 ••• ••111', linked_at: null, alerts: true } } : {})();
  routes.POST = () => ({ status: 201, body: { status: 'success', data: { code: 'ABCD2345', command: 'connect ABCD2345', expires_at: new Date(Date.now() + 900_000).toISOString(), wa_link: null } } });
  routes.DELETE = () => { linked = false; return { body: { status: 'success', data: { unlinked: true } } }; };
  const onChange = jest.fn();
  const { container } = render(<WhatsAppLinkCard embedded onChange={onChange} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Connect WhatsApp' }));
  await screen.findByTestId('wa-command');
  expect(container.querySelector('#whatsapp')).toBeNull();
  expect(screen.queryByRole('heading')).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  linked = true;
  await act(async () => { jest.advanceTimersByTime(4_100); });
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: /Disconnect/ }));
  fireEvent.click(screen.getAllByRole('button', { name: /Disconnect/ })[0]);
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
});
