/**
 * @jest-environment jsdom
 *
 * Settings for a guest, a member and an unknown state. Found on the cert Preview (2026-10-10, real Chromium at 390 px):
 * a guest got "Failed to load" in English, "could not load" balance, an empty history and a red Delete account button.
 * A guest now gets one sign-in card instead; a member keeps every card; when the check itself fails nothing destructive
 * is offered and no raw error text is shown.
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsView } from './SettingsView';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), push: jest.fn() }), usePathname: () => '/ka/settings' }));
jest.mock('../../lib/theme/ThemeContext', () => ({ useTheme: () => ({ theme: 'dark', toggleTheme: jest.fn() }) }));
jest.mock('./ConnectionsSection', () => ({ ConnectionsSection: () => <div data-testid="connections" /> }));

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply>;
let fetchMock: jest.Mock;

beforeEach(() => {
  replies = {
    '/api/credits/balance': { status: 401, body: { error: 'Unauthorized' } },
    '/api/credits/history': { status: 401, body: {} },
    '/api/referral/status': { status: 200, body: { code: 'GG50', shareUrl: 'https://myavatar.ge/r/GG50', totalReferrals: 2, creditsEarned: 100 } },
  };
  fetchMock = jest.fn(async (url: string) => {
    const key = Object.keys(replies).find((k) => String(url).startsWith(k));
    const r = key ? replies[key] : { status: 404, body: {} };
    return { ok: r.status < 400, status: r.status, json: async () => r.body } as Response;
  });
  (global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;
});

test('a guest gets one sign-in card and nothing that can only fail', async () => {
  const onAuth = jest.fn();
  window.addEventListener('myavatar:auth-required', onAuth);
  render(<SettingsView locale="ka" />);
  expect(await screen.findByTestId('settings-signin')).toHaveTextContent('ბალანსის, ისტორიისა და მოწვევების სანახავად შედი ანგარიშზე.');
  expect(screen.getByText('შესული არ ხართ')).toBeInTheDocument();
  expect(screen.queryByText('ანგარიშის წაშლა')).not.toBeInTheDocument();
  expect(screen.queryByText('მონაცემები ვერ მოვიდა.')).not.toBeInTheDocument();
  expect(screen.queryByText('ჯერ არ არის ტრანზაქცია.')).not.toBeInTheDocument();
  expect(screen.queryByText('მეგობრის მოწვევა')).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('Failed to load');
  // No referral code is created for a guest, and the history is never asked for.
  const asked = fetchMock.mock.calls.map((c) => String(c[0]));
  expect(asked.some((u) => u.startsWith('/api/referral'))).toBe(false);
  expect(asked.some((u) => u.startsWith('/api/credits/history'))).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'შესვლა' }));
  expect(onAuth).toHaveBeenCalledTimes(1);
  window.removeEventListener('myavatar:auth-required', onAuth);
});

test('a member keeps balance, history, invites and Delete account, in the page language', async () => {
  replies['/api/credits/balance'] = { status: 200, body: { balance: 80, monthlyAllowance: 100, resetAt: null } };
  replies['/api/credits/history'] = { status: 200, body: { items: [{ action: 'video', creditsDelta: -25, createdAt: '2026-10-09T10:00:00Z' }] } };
  render(<SettingsView locale="en" />);
  expect(await screen.findByText('80 / 100 credits')).toBeInTheDocument();
  expect(screen.getByText('Signed in')).toBeInTheDocument();
  expect(await screen.findByText(/Video/)).toBeInTheDocument();
  expect(await screen.findByText('Invite a friend')).toBeInTheDocument();
  expect(await screen.findByText('Code: GG50')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Delete account/ })).toBeInTheDocument();
  expect(screen.queryByTestId('settings-signin')).not.toBeInTheDocument();
  // One balance request feeds both the profile status and the balance card.
  expect(fetchMock.mock.calls.filter((c) => String(c[0]) === '/api/credits/balance')).toHaveLength(1);
});

test('when the check fails, no sign-in card, no Delete button, a plain sentence instead of a status', async () => {
  replies['/api/credits/balance'] = { status: 503, body: { error: 'upstream timeout' } };
  render(<SettingsView locale="ru" />);
  expect(await screen.findByText('Сейчас не удалось проверить.')).toBeInTheDocument();
  expect(screen.getByText('Не удалось загрузить.')).toBeInTheDocument();
  expect(screen.queryByTestId('settings-signin')).not.toBeInTheDocument();
  expect(screen.queryByText('Удалить аккаунт')).not.toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('upstream timeout');
});

test('a member whose invite card cannot load sees one plain sentence in the page language, never the raw error', async () => {
  replies['/api/credits/balance'] = { status: 200, body: { balance: 5, monthlyAllowance: 0, resetAt: null } };
  replies['/api/referral/status'] = { status: 500, body: { error: 'relation "referrals" does not exist' } };
  render(<SettingsView locale="en" />);
  expect(await screen.findByText('Could not load right now. Try again later.')).toBeInTheDocument();
  await waitFor(() => expect(document.body).not.toHaveTextContent('Failed to load'));
  expect(document.body).not.toHaveTextContent('referrals');
});

test('a failed delete shows the page\'s own sentence, not the server\'s error text', async () => {
  replies['/api/credits/balance'] = { status: 200, body: { balance: 5, monthlyAllowance: 0, resetAt: null } };
  replies['/api/account/delete'] = { status: 500, body: { success: false, error: 'service_role key missing' } };
  render(<SettingsView locale="en" />);
  fireEvent.click(await screen.findByRole('button', { name: /Delete account/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Could not delete.')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent('service_role');
});
