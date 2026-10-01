/** @jest-environment node */
/**
 * GET / DELETE /api/twin — session only. GET answers short-lived SIGNED urls for the caller's own twin (never public,
 * never another user's path); DELETE erases every path under twins/<uid>/ and the legacy live-avatars/<uid>/.
 */
jest.mock('server-only', () => ({}));

let mockUser: { id: string } | null = null;
let mockFake: import('../../../lib/twin/testing/fakeStorage').FakeStorage;
jest.mock('../../../lib/supabase/server', () => ({
  authedClientFromRequest: jest.fn(async () => ({ supabase: {}, user: mockUser })),
  createServiceRoleClient: jest.fn(() => mockFake.client()),
}));

jest.mock('../../../lib/api/rate-limit', () => {
  const realSetInterval = global.setInterval;
  global.setInterval = ((fn: () => void, ms?: number) => {
    const handle = realSetInterval(fn, ms);
    (handle as unknown as { unref?: () => void }).unref?.();
    return handle;
  }) as unknown as typeof setInterval;
  try {
    const actual = jest.requireActual('../../../lib/api/rate-limit');
    return { ...actual, checkRateLimit: jest.fn(async () => null) };
  } finally {
    global.setInterval = realSetInterval;
  }
});

import { NextRequest, NextResponse } from 'next/server';
import { DELETE, GET } from './route';
import { authedClientFromRequest } from '../../../lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '../../../lib/api/rate-limit';
import { FakeStorage, fileBytes } from '../../../lib/twin/testing/fakeStorage';
import { twinCapturePath, twinManifestPath, twinStagingPath } from '../../../lib/twin/paths';
import { writeTwinManifest } from '../../../lib/twin/store';
import { buildManifest } from '../../../lib/twin/validate';
import { twinVoicePath } from '../../../lib/avatar/twinStorage';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CAP = '0123456789abcdef';
const ENV = { ...process.env };
const authMock = authedClientFromRequest as jest.MockedFunction<typeof authedClientFromRequest>;
const rateMock = checkRateLimit as jest.MockedFunction<typeof checkRateLimit>;

const get = () => GET(new NextRequest('https://myavatar.ge/api/twin'));
const del = () => DELETE(new NextRequest('https://myavatar.ge/api/twin', { method: 'DELETE' }));

async function seedTwin(uid = UID) {
  const photos = Object.fromEntries((['front', 'left', 'right'] as const).map((s) => {
    const path = twinCapturePath(uid, CAP, s, 'jpg');
    mockFake.put('twins', path, fileBytes('jpeg'), 'image/jpeg');
    return [s, { path, mime: 'image/jpeg', bytes: 4096 }];
  })) as Parameters<typeof buildManifest>[0]['photos'];
  const voice = { path: twinCapturePath(uid, CAP, 'voice', 'webm'), mime: 'audio/webm', bytes: 20_000 };
  mockFake.put('twins', voice.path, fileBytes('webm', 20_000), 'audio/webm');
  const m = buildManifest({
    userId: uid, captureId: CAP, photos, voice, voiceSeconds: 14, digits: '40917263',
    consent: { version: 'v-test', acceptedAt: '2026-10-02T09:59:00.000Z' }, via: 'session', now: new Date('2026-10-02T10:00:00.000Z'),
  });
  await writeTwinManifest(mockFake.client(), m);
  return m;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFake = new FakeStorage();
  mockUser = { id: UID };
  process.env.NEXT_PUBLIC_TWIN_ENABLED = 'true';
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(mockFake.callsTo('getPublicUrl')).toEqual([]);
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

describe('guards (both verbs)', () => {
  test.each([['GET', get], ['DELETE', del]])('%s: flag off → 404 before auth or storage', async (_v, call) => {
    delete process.env.NEXT_PUBLIC_TWIN_ENABLED;
    expect((await call()).status).toBe(404);
    expect(authMock).not.toHaveBeenCalled();
    expect(mockFake.calls).toEqual([]);
  });

  test.each([['GET', get], ['DELETE', del]])('%s: RATE_LIMITS.WRITE applies', async (_v, call) => {
    rateMock.mockResolvedValueOnce(NextResponse.json({ error: 'Too many requests' }, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(rateMock).toHaveBeenCalledWith(expect.anything(), RATE_LIMITS.WRITE);
  });

  test.each([['GET', get], ['DELETE', del]])('%s: a guest → 401, storage untouched', async (_v, call) => {
    mockUser = null;
    expect((await call()).status).toBe(401);
    expect(mockFake.calls).toEqual([]);
  });
});

describe('GET', () => {
  test('no twin → { status: none }', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'none' });
  });

  test('a twin → signed URLs for the caller’s own objects, short-lived, never cached', async () => {
    const m = await seedTwin();
    const res = await get();
    expect(res.headers.get('cache-control')).toBe('no-store');
    const j = await res.json();
    expect(j).toMatchObject({ status: 'ready', committedAt: m.committedAt, consentVersion: 'v-test', voiceVerified: false, expiresIn: 900 });
    for (const slot of ['front', 'left', 'right', 'voice'] as const) {
      expect(j.urls[slot]).toMatch(new RegExp(`^https://proj\\.supabase\\.co/storage/v1/object/sign/twins/twins/${UID}/twin-${CAP}/${slot}\\.(jpg|webm)\\?token=SIGNED&ttl=900$`));
    }
    expect(mockFake.callsTo('createSignedUrl').every((c) => c.bucket === 'twins' && c.path!.startsWith(`twins/${UID}/`))).toBe(true);
  });

  test('a manifest naming another user’s object is not followed — none, and their path is never signed', async () => {
    await seedTwin(OTHER);
    const m = await seedTwin();
    mockFake.put('twins', twinManifestPath(UID), JSON.stringify({ ...m, photos: { ...m.photos, front: { ...m.photos.front, path: twinCapturePath(OTHER, CAP, 'front', 'jpg') } } }), 'application/json');
    expect(await (await get()).json()).toEqual({ status: 'none' });
    expect(mockFake.callsTo('createSignedUrl')).toEqual([]);
  });

  test('storage down → 503, not "none" (whether the manifest could not be looked up or not be read)', async () => {
    mockFake.failNext('list', 'network down');
    expect((await get()).status).toBe(503);
    await seedTwin();
    mockFake.failNext('download', 'network down');
    expect((await get()).status).toBe(503);
  });
});

describe('DELETE removes every path', () => {
  test('twins/<uid>/** (manifest, capture, staging, Live voice) and live-avatars/<uid>/** — and nobody else’s', async () => {
    await seedTwin();
    await seedTwin(OTHER);
    mockFake.put('twins', twinStagingPath(UID, 'front', 'jpg'), fileBytes('jpeg'), 'image/jpeg');
    mockFake.put('twins', twinVoicePath(UID, 'webm'), fileBytes('webm'), 'audio/webm');
    mockFake.put('avatars', `live-avatars/${UID}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
    mockFake.put('avatars', `live-avatars/${UID}/voice.m4a`, fileBytes('m4a'), 'audio/mp4');
    mockFake.put('avatars', `live-avatars/${OTHER}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
    const theirs = mockFake.paths('twins').filter((p) => p.includes(OTHER));

    const res = await del();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, removed: { twins: 7, legacy: 2 } });
    expect(mockFake.paths('twins')).toEqual(theirs);
    expect(mockFake.paths('avatars')).toEqual([`live-avatars/${OTHER}/poster.jpg`]);
    expect((await (await get()).json()).status).toBe('none');
  });

  test('a storage failure → 503 (the person is told it did not finish), never a false "ok"', async () => {
    await seedTwin();
    mockFake.failNext('remove', 'boom');
    const res = await del();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'unavailable' });
  });
});
