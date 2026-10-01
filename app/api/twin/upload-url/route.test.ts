/** @jest-environment node */
/**
 * POST /api/twin/upload-url — storage and auth faked (no network): dark behind the flag, rate-limited, signed-in only
 * (session, or the desktop's phone link), one signed upload per slot into the caller's OWN staging folder, digits and a
 * ticket that binds them — and never a public URL.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let mockFake: import('../../../../lib/twin/testing/fakeStorage').FakeStorage;
jest.mock('../../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: {}, user: mockUser })),
  createServiceRoleClient: jest.fn(() => mockFake.client()),
}));

jest.mock('../../../../lib/api/rate-limit', () => {
  // rate-limit.ts starts a 5-minute cleanup setInterval when it is imported; unref it so it cannot hold jest open.
  const realSetInterval = global.setInterval;
  global.setInterval = ((fn: () => void, ms?: number) => {
    const handle = realSetInterval(fn, ms);
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  }) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../../../../lib/api/rate-limit');
    return { ...actual, checkRateLimit: jest.fn(async () => null) };
  } finally {
    global.setInterval = realSetInterval;
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { POST } from './route';
import { authedClientFromRequest } from '../../../../lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '../../../../lib/api/rate-limit';
import { signHandoffToken, verifyHandoffToken } from '../../../../lib/avatar/handoff';
import { FakeStorage, fileBytes } from '../../../../lib/twin/testing/fakeStorage';
import { __resetTwinBucketCheck } from '../../../../lib/twin/store';
import { verifyCaptureTicket } from '../../../../lib/twin/ticket';

const UID = '11111111-2222-4333-8444-555555555555';
const PHONE_SESSION = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const SLOTS = { front: 'image/jpeg', left: 'image/jpeg', right: 'image/jpeg', voice: 'audio/webm;codecs=opus' };
const ENV = { ...process.env };
const rateMock = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;
const authMock = authedClientFromRequest as jest.MockedFunction<typeof authedClientFromRequest>;

const post = (body: unknown) =>
  POST(new NextRequest('https://myavatar.ge/api/twin/upload-url', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));

const signed = () => mockFake.callsTo('createSignedUploadUrl');

beforeEach(() => {
  jest.clearAllMocks();
  mockFake = new FakeStorage();
  mockUser = { id: UID };
  __resetTwinBucketCheck();
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  process.env.AVATAR_HANDOFF_SECRET = 'test-handoff-secret';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(mockFake.callsTo('getPublicUrl')).toEqual([]);
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('flag off → 404 before auth, storage or the rate limiter is touched', async () => {
  delete process.env.NEXT_PUBLIC_TWIN_ENABLED;
  const res = await post({ slots: SLOTS });
  expect(res.status).toBe(404);
  expect(authMock).not.toHaveBeenCalled();
  expect(rateMock).not.toHaveBeenCalled();
  expect(mockFake.calls).toEqual([]);
});

test('RATE_LIMITS.WRITE applies', async () => {
  rateMock.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
  const res = await post({ slots: SLOTS });
  expect(res.status).toBe(429);
  expect(rateMock).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.WRITE);
  expect(signed()).toEqual([]);
});

test('a guest is refused (401) and nothing is signed', async () => {
  mockUser = null;
  const res = await post({ slots: SLOTS });
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: 'unauthorized' });
  expect(signed()).toEqual([]);
});

test('signed in → one upsert-able signed upload per slot into the caller’s own staging, digits, and a ticket binding them', async () => {
  mockFake.put('twins', `twins/${UID}/staging/front.png`, fileBytes('png'), 'image/png'); // an abandoned capture
  const res = await post({ slots: SLOTS });
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  const j = await res.json();
  expect(j.bucket).toBe('twins');
  expect(j.uploads).toEqual({
    front: { path: `twins/${UID}/staging/front.jpg`, token: expect.any(String) },
    left: { path: `twins/${UID}/staging/left.jpg`, token: expect.any(String) },
    right: { path: `twins/${UID}/staging/right.jpg`, token: expect.any(String) },
    voice: { path: `twins/${UID}/staging/voice.webm`, token: expect.any(String) },
  });
  expect(signed().every((c) => c.bucket === 'twins' && (c.opts as { upsert: boolean }).upsert === true)).toBe(true);
  expect(j.digits).toMatch(/^\d{8}$/);
  expect(verifyCaptureTicket(j.ticket)).toMatchObject({ u: UID, d: j.digits, s: { front: 'jpg', left: 'jpg', right: 'jpg', voice: 'webm' } });
  expect(Date.parse(j.expiresAt) - Date.now()).toBeGreaterThan(110 * 60_000);
  expect(mockFake.paths('twins')).toEqual([]); // the abandoned staging object went first
});

test('photo-only (a browser that cannot record) → no voice slot', async () => {
  const { voice: _voice, ...photos } = SLOTS;
  const j = await (await post({ slots: photos })).json();
  expect(Object.keys(j.uploads).sort()).toEqual(['front', 'left', 'right']);
  expect(verifyCaptureTicket(j.ticket)!.s).toEqual({ front: 'jpg', left: 'jpg', right: 'jpg' });
});

test.each([
  ['an SVG photo', { ...SLOTS, front: 'image/svg+xml' }, 'front'],
  ['HTML', { ...SLOTS, left: 'text/html' }, 'left'],
  ['a missing photo type', { ...SLOTS, right: undefined }, 'right'],
  ['an image in the voice slot', { ...SLOTS, voice: 'image/jpeg' }, 'voice'],
])('%s → 400, nothing signed', async (_label, slots, slot) => {
  const res = await post({ slots });
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'unsupported_type', slot });
  expect(signed()).toEqual([]);
});

describe('the phone (QR) flow — the desktop user’s handoff link', () => {
  test('a valid link signs into the LINK’s user, even on a phone signed into another account', async () => {
    mockUser = { id: PHONE_SESSION };
    const j = await (await post({ slots: SLOTS, handoffToken: signHandoffToken(UID) })).json();
    expect(j.uploads.front.path).toBe(`twins/${UID}/staging/front.jpg`);
    expect(verifyCaptureTicket(j.ticket)!.u).toBe(UID);
    expect(signed().some((c) => c.path!.includes(PHONE_SESSION))).toBe(false);
  });

  test('a link that was already used is refused', async () => {
    const token = signHandoffToken(UID)!;
    mockFake.put('twins', `handoff/${verifyHandoffToken(token)!.jti}`, '1', 'text/plain');
    const res = await post({ slots: SLOTS, handoffToken: token });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'link_already_used' });
    expect(signed()).toEqual([]);
  });

  test('a forged or expired link is refused — it does not fall back to the phone’s own session', async () => {
    for (const handoffToken of ['forged.token', signHandoffToken(UID, -1)]) {
      const res = await post({ slots: SLOTS, handoffToken });
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'invalid_or_expired_link' });
    }
    expect(signed()).toEqual([]);
  });
});

test('a public (or missing) twins bucket → 503 and nothing is signed into it', async () => {
  mockFake.bucketMeta.set('twins', { public: true });
  expect((await post({ slots: SLOTS })).status).toBe(503);
  __resetTwinBucketCheck();
  mockFake.bucketMeta.set('twins', null);
  expect((await post({ slots: SLOTS })).status).toBe(503);
  expect(signed()).toEqual([]);
});

test('no signing key → 503 (fail closed)', async () => {
  delete process.env.AVATAR_HANDOFF_SECRET;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  expect((await post({ slots: SLOTS })).status).toBe(503);
  expect(signed()).toEqual([]);
});

test('a storage failure while signing → 503', async () => {
  mockFake.failNext('createSignedUploadUrl', 'boom');
  expect((await post({ slots: SLOTS })).status).toBe(503);
});
