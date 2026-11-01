/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { NextRequest } from 'next/server';

const mockPut = jest.fn();
const mockExchange = jest.fn();
const mockVerify = jest.fn();
const mockAccess = jest.fn();

jest.mock('../../../../../lib/supabase/server', () => ({ authedClientFromRequest: async () => ({ user: { id: 'user1' } }) }));
jest.mock('../../../../../lib/api/rate-limit', () => ({ RATE_LIMITS: { READ: {} }, checkRateLimit: async () => null }));
jest.mock('../../../../../lib/connectors/google', () => ({
  liveDriveDeps: async () => ({ cfg: { keys: {} }, store: { put: mockPut }, tableReady: true }),
  driveRedirectUri: (origin: string) => `${origin}/api/connectors/google_drive/callback`,
}));
jest.mock('../../../../../lib/connectors/google/crypto', () => ({ verifyState: (...args: unknown[]) => mockVerify(...args), encryptToken: () => 'sealed' }));
jest.mock('../../../../../lib/connectors/google/oauth', () => ({ exchangeCode: (...args: unknown[]) => mockExchange(...args), revokeToken: jest.fn() }));
jest.mock('../../../../../lib/connectors/google/drive', () => ({ DRIVE_ID_RE: /^[A-Za-z0-9_-]{10,200}$/, driveAccessToken: (...args: unknown[]) => mockAccess(...args) }));

import { GET } from './route';

function callback(query: string, mode = 'picker') {
  const req = new NextRequest(`https://myavatar.ge/api/connectors/google_drive/callback?state=s&code=c${query}`);
  req.cookies.set('drive_oauth', `v~s~en~${mode}`);
  return req;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerify.mockReturnValue({ ok: true });
  mockExchange.mockResolvedValue({ ok: true, accessToken: 'new', refreshToken: '', scope: 'drive.file', email: null });
  mockAccess.mockResolvedValue({ ok: true, accessToken: 'original' });
  global.fetch = jest.fn(async () => new Response('{}', { status: 200 })) as jest.Mock;
});

test('cancelled or malformed Picker selections preserve the existing account', async () => {
  expect((await GET(callback(''))).headers.get('location')).toContain('drive=error');
  expect((await GET(callback('&picked_file_ids=../bad'))).headers.get('location')).toContain('drive=error');
  expect(mockExchange).not.toHaveBeenCalled();
  expect(mockPut).not.toHaveBeenCalled();
});

test('Picker checks access with the existing connection without replacing it', async () => {
  const res = await GET(callback('&picked_file_ids=abcdefghij'));
  expect(res.headers.get('location')).toContain('drive=linked');
  expect(mockVerify).toHaveBeenCalledWith('s', 'user1:picker', expect.anything());
  expect(mockAccess).toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/abcdefghij?'), expect.objectContaining({ headers: { Authorization: 'Bearer original' } }));
  expect(mockPut).not.toHaveBeenCalled();
});

test('a selection inaccessible to the existing account fails without replacing it', async () => {
  (global.fetch as jest.Mock).mockResolvedValue(new Response('{}', { status: 404 }));
  const res = await GET(callback('&picked_file_ids=abcdefghij'));
  expect(res.headers.get('location')).toContain('drive=error');
  expect(mockPut).not.toHaveBeenCalled();
});
