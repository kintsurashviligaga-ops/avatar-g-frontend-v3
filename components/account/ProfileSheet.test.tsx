/**
 * @jest-environment jsdom
 *
 * ProfileSheet — Settings → „პროფილი“ is the whole account now (the owner's PRD of 2026-10-18, 2.3), not a photo and a
 * name: the account's details as Supabase knows them, the name saved, the language, the balance with its last
 * movements, the password (8+, twice; the other devices signed out after it), signing out of the other devices, the
 * data export as a file, deletion and sign-out. Supabase and fetch are fakes.
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockAuth = {
  getUser: jest.fn(),
  updateUser: jest.fn(),
  signOut: jest.fn(),
};
jest.mock('../../lib/supabase/browser', () => ({ createBrowserClient: () => ({ auth: mockAuth }) }));

import {
  PROFILE_STRINGS, ProfileSheet, accountDetailsOf, dateOf, exportFileName, passwordErrorOf, type ProfileSheetProps,
} from './ProfileSheet';

const ka = PROFILE_STRINGS.ka;
const USER = {
  email: 'gg@example.com',
  phone: '',
  created_at: '2026-10-01T09:00:00Z',
  email_confirmed_at: '2026-10-01T09:05:00Z',
  identities: [{ provider: 'email' }, { provider: 'google' }],
  app_metadata: { providers: ['email', 'google'] },
  user_metadata: { password_set: true },
};

let fetchMock: jest.Mock;
async function setup(over: Partial<ProfileSheetProps> = {}) {
  const props: ProfileSheetProps = {
    open: true, locale: 'ka', onClose: jest.fn(), name: 'გიორგი', email: USER.email,
    avatarUrl: null, avatarBroken: false, onAvatarBroken: jest.fn(), avatarBusy: false, onPickPhoto: jest.fn(),
    onNameSaved: jest.fn(), balance: 120, onTopUp: jest.fn(), liveAvatarLabel: 'ცოცხალი ავატარის შექმნა', onLiveAvatar: jest.fn(),
    onLanguage: jest.fn(), onSignOut: jest.fn(),
    ...over,
  };
  // The sheet reads the account and the ledger as it opens: let both answer before the test looks.
  await act(async () => { render(<ProfileSheet {...props} />); });
  return props;
}

beforeEach(() => {
  mockAuth.getUser.mockReset().mockResolvedValue({ data: { user: USER } });
  mockAuth.updateUser.mockReset().mockResolvedValue({ data: {}, error: null });
  mockAuth.signOut.mockReset().mockResolvedValue({ error: null });
  fetchMock = jest.fn(async (url: string) => {
    if (url.startsWith('/api/credits/history')) {
      return { ok: true, json: async () => ({ items: [
        { action: 'topup', creditsDelta: 100, createdAt: '2026-10-17T10:00:00Z' },
        { action: 'music', creditsDelta: -5, createdAt: '2026-10-18T10:00:00Z' },
      ] }) };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  (globalThis as { fetch?: unknown }).fetch = fetchMock;
});

test('a named dialog with the account as Supabase knows it: email confirmed, how they sign in, since when', async () => {
  await setup();
  const dialog = screen.getByRole('dialog', { name: ka.title });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByTestId('profile-display-name')).toHaveTextContent('გიორგი');
  expect(screen.getByTestId('profile-email')).toHaveTextContent(USER.email);
  expect(await screen.findByTestId('profile-email-state')).toHaveTextContent(ka.verified);
  expect(screen.getByTestId('profile-methods')).toHaveTextContent(`${ka.byEmail} · ${ka.google}`);
  expect(screen.getByTestId('profile-since')).toHaveTextContent('1 ოქტომბერი 2026');
  // Every section is there, in one window.
  for (const h of [ka.personal, ka.language, ka.balance, ka.security, ka.data]) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument();
});

test('the name saves to the account and is handed back; an unchanged name has nothing to save', async () => {
  const props = await setup();
  const save = screen.getByTestId('profile-name-save');
  expect(save).toBeDisabled();
  fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: '  ნინო  ' } });
  expect(save).toBeEnabled();
  await act(async () => { fireEvent.click(save); });
  expect(mockAuth.updateUser).toHaveBeenCalledWith({ data: { name: 'ნინო' } });
  expect(props.onNameSaved).toHaveBeenCalledWith('ნინო');
  expect(screen.getByTestId('profile-name-status')).toHaveTextContent(ka.saved);
});

test('a failed save says so and keeps the sheet open', async () => {
  mockAuth.updateUser.mockResolvedValue({ data: {}, error: { message: 'network' } });
  const props = await setup();
  fireEvent.change(screen.getByTestId('profile-name-input'), { target: { value: 'ნინო' } });
  await act(async () => { fireEvent.click(screen.getByTestId('profile-name-save')); });
  expect(screen.getByTestId('profile-name-status')).toHaveTextContent(ka.saveFailed);
  expect(props.onNameSaved).not.toHaveBeenCalled();
  expect(props.onClose).not.toHaveBeenCalled();
});

test('the balance, „შევსება“ and the last movements from the ledger', async () => {
  const props = await setup();
  expect(screen.getByTestId('profile-balance')).toHaveTextContent('120 კრედიტი');
  await waitFor(() => expect(screen.getByTestId('profile-history')).toHaveTextContent('შევსება'));
  expect(screen.getByTestId('profile-history')).toHaveTextContent('მუსიკა');
  expect(screen.getByTestId('profile-history')).toHaveTextContent('+100');
  expect(screen.getByTestId('profile-history')).toHaveTextContent('−5');
  expect(fetchMock.mock.calls[0][0]).toBe('/api/credits/history?limit=5');
  fireEvent.click(screen.getByTestId('profile-topup'));
  expect(props.onTopUp).toHaveBeenCalledTimes(1);
});

test('the language: the current one is pressed; another one is handed to the chat, which keeps the chat open', async () => {
  const props = await setup();
  expect(screen.getByTestId('profile-lang-ka')).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByTestId('profile-lang-ka'));
  expect(props.onLanguage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('profile-lang-en'));
  expect(props.onLanguage).toHaveBeenCalledWith('en');
});

test('the password: 8+, typed twice; then it changes and every other device is signed out', async () => {
  await setup();
  fireEvent.click(await screen.findByRole('button', { name: ka.changePassword }));
  const save = screen.getByTestId('profile-password-save');
  fireEvent.change(screen.getByTestId('profile-password-new'), { target: { value: 'short' } });
  fireEvent.change(screen.getByTestId('profile-password-repeat'), { target: { value: 'short' } });
  await act(async () => { fireEvent.click(save); });
  expect(screen.getByTestId('profile-security-status')).toHaveTextContent(ka.errWeak);
  fireEvent.change(screen.getByTestId('profile-password-new'), { target: { value: 'long-enough-1' } });
  fireEvent.change(screen.getByTestId('profile-password-repeat'), { target: { value: 'long-enough-2' } });
  await act(async () => { fireEvent.click(save); });
  expect(screen.getByTestId('profile-security-status')).toHaveTextContent(ka.errMismatch);
  expect(mockAuth.updateUser).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId('profile-password-repeat'), { target: { value: 'long-enough-1' } });
  await act(async () => { fireEvent.click(save); });
  expect(mockAuth.updateUser).toHaveBeenCalledWith({ password: 'long-enough-1', data: { password_set: true } });
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  expect(screen.getByTestId('profile-security-status')).toHaveTextContent(ka.passwordSaved);
  expect(screen.queryByTestId('profile-password-form')).toBeNull();
});

test('an account with no password is offered to SET one; Supabase\'s refusals read in the person\'s words', async () => {
  mockAuth.getUser.mockResolvedValue({ data: { user: { ...USER, identities: [{ provider: 'google' }], app_metadata: { providers: ['google'] }, user_metadata: {} } } });
  await setup();
  expect(await screen.findByRole('button', { name: ka.setPassword })).toBeInTheDocument();
  expect(passwordErrorOf({ code: 'same_password' }, ka)).toBe(ka.errSame);
  expect(passwordErrorOf({ message: 'Reauthentication needed' }, ka)).toBe(ka.errReauth);
  expect(passwordErrorOf({ code: 'weak_password' }, ka)).toBe(ka.errWeak);
  expect(passwordErrorOf(new Error('boom'), ka)).toBe(ka.errGeneric);
});

test('sign out of the other devices: only the others, and it says so', async () => {
  await setup();
  await act(async () => { fireEvent.click(screen.getByTestId('profile-signout-others')); });
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'others' });
  expect(screen.getByTestId('profile-security-status')).toHaveTextContent(ka.signedOutOthers);
});

test('the data export downloads a file named by the server; a failure says so', async () => {
  const blob = new Blob(['{}'], { type: 'application/json' });
  const created = jest.fn(() => 'blob:x');
  Object.assign(URL, { createObjectURL: created, revokeObjectURL: jest.fn() });
  const clicks: string[] = [];
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
  fetchMock.mockImplementation(async (url: string) => (url === '/api/account/export'
    ? { ok: true, blob: async () => blob, headers: { get: () => 'attachment; filename="myavatar-data-abcd1234.json"' } }
    : { ok: true, json: async () => ({ items: [] }) }));
  await setup();
  await act(async () => { fireEvent.click(screen.getByTestId('profile-export')); });
  expect(created).toHaveBeenCalledWith(blob);
  expect(clicks).toEqual(['myavatar-data-abcd1234.json']);
  fetchMock.mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await act(async () => { fireEvent.click(screen.getByTestId('profile-export')); });
  expect(screen.getByRole('alert')).toHaveTextContent(ka.downloadFailed);
  click.mockRestore();
});

test('the rest of the account: live avatar, delete (its own confirmed page), sign out; photo upload is handed up', async () => {
  const props = await setup();
  expect(screen.getByTestId('profile-delete')).toHaveAttribute('href', '/ka/account/delete');
  fireEvent.click(screen.getByTestId('profile-live-avatar'));
  expect(props.onLiveAvatar).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId('profile-signout'));
  expect(props.onSignOut).toHaveBeenCalledTimes(1);
  const file = new File(['x'], 'me.png', { type: 'image/png' });
  fireEvent.change(screen.getByTestId('profile-photo-input'), { target: { files: [file] } });
  expect(props.onPickPhoto).toHaveBeenCalledWith(file);
});

test.each([['en', 'Profile', 'Security'], ['ru', 'Профиль', 'Безопасность']] as const)('%s', async (locale, title, security) => {
  await setup({ locale });
  expect(screen.getByRole('dialog', { name: title })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: security })).toBeInTheDocument();
  expect(screen.getByTestId('profile-delete')).toHaveAttribute('href', `/${locale}/account/delete`);
});

test('helpers: details from a bare user, the export name without a header', () => {
  expect(accountDetailsOf(null)).toEqual({ emailConfirmed: false, phone: null, methods: [], createdAt: null, hasPassword: false });
  expect(accountDetailsOf({ identities: [{ provider: 'email' }] }).hasPassword).toBe(true);
  expect(accountDetailsOf({ identities: [{ provider: 'email' }], user_metadata: { password_set: false } }).hasPassword).toBe(false);
  expect(exportFileName(null, new Date('2026-10-18T12:00:00Z'))).toBe('myavatar-data-2026-10-18.json');
  expect(dateOf('2026-10-17T10:00:00Z', 'ka', false)).toBe('17 ოქტ');
  expect(dateOf('2026-03-05T10:00:00Z', 'ka')).toBe('5 მარტი 2026');
  expect(dateOf('nonsense', 'ka')).toBe('nonsense');
});
