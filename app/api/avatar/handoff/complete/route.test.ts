/** @jest-environment node */
/**
 * POST /api/avatar/handoff/complete (the legacy phone selfie, flag off) — the handoff link is now SINGLE USE: the first
 * completion wins, a replay is refused before anything is written, and a failed enrollment gives the link back.
 */
jest.mock('server-only', () => ({}));

let mockFake: import('../../../../../lib/twin/testing/fakeStorage').FakeStorage;
jest.mock('../../../../../lib/supabase/server', () => ({
  createServiceRoleClient: jest.fn(() => mockFake.client()),
}));

const mockEnroll = jest.fn(async (_uid: string, _dataUrl: string) => ({ ok: true as const, url: 'https://x/poster.jpg', avatarAssetId: null }));
const mockVoice = jest.fn(async () => ({ ok: true }));
jest.mock('../../../../../lib/avatar/enroll', () => ({
  enrollSelfieAvatar: (uid: string, dataUrl: string) => mockEnroll(uid, dataUrl),
  storeLiveAvatarVoice: () => mockVoice(),
}));

jest.mock('../../../../../lib/api/rate-limit', () => {
  const realSetInterval = global.setInterval;
  global.setInterval = ((fn: () => void, ms?: number) => {
    const handle = realSetInterval(fn, ms);
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  }) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../../../../../lib/api/rate-limit');
    return { ...actual, checkRateLimit: jest.fn(async () => null) };
  } finally {
    global.setInterval = realSetInterval;
  }
});

import { NextRequest } from 'next/server';
import { POST } from './route';
import { signHandoffToken, verifyHandoffToken } from '../../../../../lib/avatar/handoff';
import { FakeStorage } from '../../../../../lib/twin/testing/fakeStorage';

const UID = '11111111-2222-4333-8444-555555555555';
const SELFIE = 'data:image/jpeg;base64,/9j/4AAQ';
const ENV = { ...process.env };

const complete = (body: unknown) =>
  POST(new NextRequest('https://myavatar.ge/api/avatar/handoff/complete', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

beforeEach(() => {
  jest.clearAllMocks();
  mockFake = new FakeStorage();
  process.env.AVATAR_HANDOFF_SECRET = 'test-handoff-secret';
});
afterEach(() => {
  process.env = { ...ENV };
});

test('the first completion enrolls; the same link replayed is refused before anything is written', async () => {
  const token = signHandoffToken(UID)!;
  const first = await complete({ token, dataUrl: SELFIE });
  expect(first.status).toBe(200);
  expect(mockEnroll).toHaveBeenCalledTimes(1);
  expect(mockEnroll).toHaveBeenCalledWith(UID, SELFIE);
  expect(mockFake.paths('twins')).toEqual([`handoff/${verifyHandoffToken(token)!.jti}`]);

  const replay = await complete({ token, dataUrl: 'data:image/jpeg;base64,ATTACKER' });
  expect(replay.status).toBe(401);
  expect(await replay.json()).toEqual({ error: 'invalid_or_expired_link' });
  expect(mockEnroll).toHaveBeenCalledTimes(1);
});

test('a failed enrollment gives the link back — the person can retry with the same QR', async () => {
  const token = signHandoffToken(UID)!;
  mockEnroll.mockResolvedValueOnce({ ok: false, status: 413, error: 'too large (max 8MB)' } as never);
  expect((await complete({ token, dataUrl: SELFIE })).status).toBe(413);
  expect(mockFake.paths('twins')).toEqual([]);
  expect((await complete({ token, dataUrl: SELFIE })).status).toBe(200);
});

test('the used-link store cannot answer → 503 and nothing is enrolled (the link is not spent)', async () => {
  const token = signHandoffToken(UID)!;
  mockFake.failNext('upload', 'network down');
  expect((await complete({ token, dataUrl: SELFIE })).status).toBe(503);
  expect(mockEnroll).not.toHaveBeenCalled();
  expect((await complete({ token, dataUrl: SELFIE })).status).toBe(200);
});

test('no / forged / expired token → 401, storage untouched', async () => {
  for (const token of [undefined, 'forged.sig', signHandoffToken(UID, -1)]) {
    expect((await complete({ token, dataUrl: SELFIE })).status).toBe(401);
  }
  expect(mockEnroll).not.toHaveBeenCalled();
  expect(mockFake.calls).toEqual([]);
});
