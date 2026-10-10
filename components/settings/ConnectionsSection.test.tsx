/**
 * @jest-environment jsdom
 *
 * Settings → Connections: the four rows show only what the server says (no „Connected" from the browser), the WhatsApp
 * row opens by itself on #whatsapp, rows open one at a time, an unavailable channel offers nothing to press, a guest gets
 * one sign-in button, and a failed load says so with a retry.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConnectionsSection } from './ConnectionsSection';

let waOnChange: (() => void) | undefined;
jest.mock('../agent-g/WhatsAppLinkCard', () => ({
  WhatsAppLinkCard: (p: { embedded?: boolean; onChange?: () => void }) => {
    waOnChange = p.onChange;
    return <div data-testid="wa-card">{p.embedded ? 'embedded' : 'full'}</div>;
  },
}));
jest.mock('../notifications/PushPermissionCard', () => ({ PushPermissionCard: () => <div data-testid="push-card" /> }));
jest.mock('./NotificationPrefsPanel', () => ({
  NotificationPrefsPanel: (p: { whatsappState: string }) => <div data-testid="prefs-panel">{p.whatsappState}</div>,
}));

type View = { id: string; state: string; detail?: string };
let reply: { status: number; body: unknown };
let fetchMock: jest.Mock;
const ok = (connections: View[], guest = false) => ({ status: 200, body: { status: 'success', data: { guest, connections } } });
const SIGNED_IN: View[] = [
  { id: 'phone', state: 'unavailable' },
  { id: 'whatsapp', state: 'connect' },
  { id: 'telegram', state: 'unavailable' },
  { id: 'notifications', state: 'on' },
];

beforeEach(() => {
  waOnChange = undefined;
  reply = ok(SIGNED_IN);
  fetchMock = jest.fn(async () => ({ ok: reply.status < 400, status: reply.status, json: async () => reply.body }) as Response);
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
  window.location.hash = '';
});

test('four rows, each with the server\'s word, in Georgian by default', async () => {
  render(<ConnectionsSection locale="ka" />);
  expect(await screen.findByTestId('conn-state-whatsapp')).toHaveTextContent('დაკავშირება');
  expect(screen.getByTestId('conn-state-phone')).toHaveTextContent('დროებით მიუწვდომელია');
  expect(screen.getByTestId('conn-state-telegram')).toHaveTextContent('დროებით მიუწვდომელია');
  expect(screen.getByTestId('conn-state-notifications')).toHaveTextContent('ჩართულია');
  expect(screen.getByRole('heading', { name: 'კავშირები' })).toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledWith('/api/agent-g/channels', expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
});

test('a linked number shows „Connected" with the masked number the server sent', async () => {
  reply = ok([{ id: 'phone', state: 'unavailable' }, { id: 'whatsapp', state: 'connected', detail: '+995 ••• ••456' }, { id: 'telegram', state: 'unavailable' }, { id: 'notifications', state: 'on' }]);
  render(<ConnectionsSection locale="en" />);
  expect(await screen.findByTestId('conn-state-whatsapp')).toHaveTextContent('Connected');
  expect(screen.getByTestId('conn-row-whatsapp')).toHaveTextContent('+995 ••• ••456');
});

test('rows open one at a time; phone and Telegram say one sentence and offer nothing to press', async () => {
  render(<ConnectionsSection locale="en" />);
  const phone = await screen.findByRole('button', { name: /Phone: calls & SMS/ });
  fireEvent.click(phone);
  expect(phone).toHaveAttribute('aria-expanded', 'true');
  const panel = screen.getByTestId('conn-panel-phone');
  expect(panel).toHaveTextContent('Agent G calls and SMS are not available yet.');
  expect(panel.querySelector('button, a')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: /Telegram/ }));
  expect(screen.queryByTestId('conn-panel-phone')).toBeNull();
  expect(screen.getByTestId('conn-panel-telegram').querySelector('button, a')).toBeNull();
});

test('WhatsApp opens the embedded link flow; a link or unlink there re-reads the statuses', async () => {
  render(<ConnectionsSection locale="en" />);
  fireEvent.click(await screen.findByRole('button', { name: /WhatsApp/ }));
  expect(screen.getByTestId('wa-card')).toHaveTextContent('embedded');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  reply = ok(SIGNED_IN.map((c) => (c.id === 'whatsapp' ? { ...c, state: 'connected', detail: '+995 ••• ••456' } : c)));
  await act(async () => { waOnChange?.(); });
  await waitFor(() => expect(screen.getByTestId('conn-state-whatsapp')).toHaveTextContent('Connected'));
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('WhatsApp unavailable on the server → the row says so and there is no link flow', async () => {
  reply = ok(SIGNED_IN.map((c) => (c.id === 'whatsapp' ? { ...c, state: 'unavailable' } : c)));
  render(<ConnectionsSection locale="en" />);
  fireEvent.click(await screen.findByRole('button', { name: /WhatsApp/ }));
  expect(screen.getByTestId('wa-row-off')).toHaveTextContent('Temporarily unavailable');
  expect(screen.queryByTestId('wa-card')).toBeNull();
});

test('/settings#whatsapp opens the WhatsApp row by itself', async () => {
  window.location.hash = '#whatsapp';
  Element.prototype.scrollIntoView = jest.fn();
  render(<ConnectionsSection locale="en" />);
  expect(await screen.findByTestId('wa-card')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /WhatsApp/ })).toHaveAttribute('aria-expanded', 'true');
});

test('notifications: push for this browser and the what-goes-where panel, told the WhatsApp state', async () => {
  render(<ConnectionsSection locale="ru" />);
  fireEvent.click(await screen.findByRole('button', { name: /Уведомления/ }));
  expect(screen.getByTestId('push-card')).toBeInTheDocument();
  expect(screen.getByTestId('prefs-panel')).toHaveTextContent('connect');
});

test('a guest gets one sign-in button that opens the sign-in sheet', async () => {
  reply = ok([{ id: 'phone', state: 'unavailable' }, { id: 'whatsapp', state: 'signin' }, { id: 'telegram', state: 'unavailable' }, { id: 'notifications', state: 'signin' }], true);
  const onAuth = jest.fn();
  window.addEventListener('myavatar:auth-required', onAuth);
  render(<ConnectionsSection locale="en" />);
  fireEvent.click(await screen.findByRole('button', { name: /WhatsApp/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(onAuth).toHaveBeenCalledTimes(1);
  expect(screen.queryByTestId('wa-card')).toBeNull();
  window.removeEventListener('myavatar:auth-required', onAuth);
});

test('a failed load says so and Retry reads again', async () => {
  reply = { status: 500, body: {} };
  render(<ConnectionsSection locale="en" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load the status.');
  reply = ok(SIGNED_IN);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('conn-state-whatsapp')).toHaveTextContent('Connect');
});
