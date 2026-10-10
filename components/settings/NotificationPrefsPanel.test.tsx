/**
 * @jest-environment jsdom
 *
 * Settings → Connections → Notifications: the site is always on; WhatsApp switches appear only for a linked number;
 * Telegram, SMS and calls are named as unavailable with nothing to press; a press saves at once and a failed save puts
 * the switch back and says so.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NotificationPrefsPanel } from './NotificationPrefsPanel';
import { DEFAULT_PREFS, type NotifyPrefs } from '@/lib/notifications/preferences';

type R = { status: number; body: unknown };
let getReply: R;
let putReply: (body: { prefs: NotifyPrefs }) => R;
let fetchMock: jest.Mock;
const data = (whatsapp: boolean, prefs: NotifyPrefs = DEFAULT_PREFS) => ({
  status: 200, body: { status: 'success', data: { prefs, saved: false, available: { whatsapp, telegram: false, sms: false, call: false } } },
});

beforeEach(() => {
  getReply = data(true);
  putReply = (b) => ({ status: 200, body: { status: 'success', data: { prefs: b.prefs } } });
  fetchMock = jest.fn(async (_u: string, init?: RequestInit) => {
    const r = (init?.method ?? 'GET') === 'PUT' ? putReply(JSON.parse(String(init?.body))) : getReply;
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
  });
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

test('no linked WhatsApp → only „on the site", no switches, the later places named as unavailable', async () => {
  getReply = data(false);
  render(<NotificationPrefsPanel lang="en" whatsappState="connect" />);
  expect(await screen.findByTestId('notify-prefs')).toHaveTextContent('Always on the site');
  expect(screen.queryByTestId('notify-wa-task_completed')).toBeNull();
  expect(screen.getByText('Connect WhatsApp first to get news there.')).toBeInTheDocument();
  expect(screen.getByTestId('notify-later')).toHaveTextContent('Telegram, SMS and calls are temporarily unavailable.');
  expect(screen.getAllByRole('listitem')).toHaveLength(5);
});

test('linked WhatsApp → the moderate defaults: finished tasks and approvals on, the rest off', async () => {
  render(<NotificationPrefsPanel lang="en" whatsappState="connected" />);
  expect(await screen.findByTestId('notify-wa-task_completed')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('notify-wa-approval_required')).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByTestId('notify-wa-needs_attention')).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('notify-wa-scheduled_report')).toHaveAttribute('aria-pressed', 'false');
  expect(screen.getByTestId('notify-wa-reminder')).toHaveAttribute('aria-pressed', 'false');
});

test('a press saves at once with the whole preference set', async () => {
  render(<NotificationPrefsPanel lang="ka" whatsappState="connected" />);
  fireEvent.click(await screen.findByTestId('notify-wa-reminder'));
  await waitFor(() => expect(screen.getByTestId('notify-wa-reminder')).toHaveAttribute('aria-pressed', 'true'));
  const put = fetchMock.mock.calls.find(([, i]) => i?.method === 'PUT');
  expect(put?.[0]).toBe('/api/notifications/preferences');
  const sent = JSON.parse(String(put?.[1]?.body)) as { prefs: NotifyPrefs };
  expect(sent.prefs.events.reminder).toEqual(['site', 'whatsapp']);
  expect(sent.prefs.events.task_completed).toEqual(['site', 'whatsapp']);
});

test('a failed save puts the switch back and says so', async () => {
  putReply = () => ({ status: 503, body: { status: 'error' } });
  render(<NotificationPrefsPanel lang="en" whatsappState="connected" />);
  fireEvent.click(await screen.findByTestId('notify-wa-task_completed'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not save. Try again.');
  expect(screen.getByTestId('notify-wa-task_completed')).toHaveAttribute('aria-pressed', 'true');
});

test('a failed load says so; Retry reads again', async () => {
  getReply = { status: 500, body: {} };
  render(<NotificationPrefsPanel lang="en" whatsappState="connect" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your settings.');
  getReply = data(false);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByTestId('notify-prefs')).toBeInTheDocument();
});

test('every switch is at least 44px tall', async () => {
  render(<NotificationPrefsPanel lang="en" whatsappState="connected" />);
  const b = await screen.findByTestId('notify-wa-task_completed');
  expect(b.className).toContain('min-h-[44px]');
});
