/** @jest-environment node */
/**
 * GET /api/avatar/core — the saved Live Avatar's photo as a SIGNED url (private since 2026-10-24); the old public poster is
 * moved private on first read and never served; with NEXT_PUBLIC_TWIN_ENABLED and no Live Avatar, the twin's front
 * photo. DELETE removes the Live Avatar. Older fields keep their shape.
 */
jest.mock('server-only', () => ({}));

let mockUserId: string | null = null;
let mockFake: import('../../../../lib/twin/testing/fakeStorage').FakeStorage;
jest.mock('../../../../lib/supabase/server', () => ({
  requireUser: jest.fn(async () => {
    if (!mockUserId) throw new Error('UNAUTHENTICATED');
    return { id: mockUserId };
  }),
  createServiceRoleClient: jest.fn(() => mockFake.client()),
}));

import { NextRequest } from 'next/server';
import sharp from 'sharp';
import { DELETE, GET } from './route';
import { saveLiveAvatar } from '../../../../lib/avatar/liveAvatar';
import { __resetTwinBucketCheck } from '../../../../lib/twin/store';
import { FakeStorage, fileBytes } from '../../../../lib/twin/testing/fakeStorage';
import { twinCapturePath } from '../../../../lib/twin/paths';
import { writeTwinManifest } from '../../../../lib/twin/store';
import { buildManifest } from '../../../../lib/twin/validate';

const UID = '11111111-2222-4333-8444-555555555555';
const CAP = '0123456789abcdef';
const ENV = { ...process.env };

const core = async () => {
  const res = await GET(new NextRequest('https://myavatar.ge/api/avatar/core'));
  return { status: res.status, body: (await res.json()) as { data?: { status: string; poster_url: string | null; updated_at: string | null; live_avatar?: unknown } } };
};

async function seedTwin() {
  const photos = Object.fromEntries((['front', 'left', 'right'] as const).map((s) => {
    const path = twinCapturePath(UID, CAP, s, 'jpg');
    mockFake.put('twins', path, fileBytes('jpeg'), 'image/jpeg');
    return [s, { path, mime: 'image/jpeg', bytes: 4096 }];
  })) as Parameters<typeof buildManifest>[0]['photos'];
  const m = buildManifest({
    userId: UID, captureId: CAP, photos, voice: null, voiceSeconds: null, digits: '40917263',
    consent: { version: 'v-test', acceptedAt: '2026-10-02T09:59:00.000Z' }, via: 'handoff', now: new Date('2026-10-02T10:00:00.000Z'),
  });
  await writeTwinManifest(mockFake.client(), m);
  return m;
}

beforeEach(() => {
  mockFake = new FakeStorage();
  mockUserId = UID;
  __resetTwinBucketCheck();
  delete process.env.NEXT_PUBLIC_TWIN_ENABLED;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(mockFake.callsTo('getPublicUrl', 'twins')).toEqual([]);
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

const selfie = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 140, b: 110 } } }).jpeg().toBuffer();

test('a saved Live Avatar: its photo as a SIGNED url, core_avatar_id = its stable id, the state for the screen', async () => {
  const saved = await saveLiveAvatar(mockFake.client(), UID, { mime: 'image/jpeg', bytes: await selfie(1080, 1920), source: 'camera' });
  if (!saved.ok) throw new Error('save');
  const { status, body } = await core();
  expect(status).toBe(200);
  expect(body.data).toMatchObject({ status: 'ready', core_avatar_id: saved.manifest.avatarId, updated_at: saved.manifest.updatedAt });
  expect(body.data!.poster_url).toBe(`https://proj.supabase.co/storage/v1/object/sign/twins/${saved.manifest.photo.path}?token=SIGNED&ttl=3600`);
  expect(body.data!.live_avatar).toMatchObject({ id: saved.manifest.avatarId, state: 'custom_unavailable', prep: { ok: true } });
  expect(mockFake.callsTo('getPublicUrl')).toEqual([]);
});

test('the old PUBLIC poster is never served: it is moved private and removed, even with a twin and the flag off', async () => {
  await seedTwin();
  mockFake.put('avatars', `live-avatars/${UID}/poster.jpg`, new Uint8Array(await selfie(720, 720)), 'image/jpeg');
  const { body } = await core();
  expect(body.data!.poster_url).toMatch(new RegExp(`/object/sign/twins/twins/${UID}/live-avatar-[0-9a-f]{16}/photo\\.jpg`));
  expect(body.data!.live_avatar).toMatchObject({ state: 'saved_photo', prep: { ok: false, reasons: ['too_small'] } });
  expect(mockFake.paths('avatars')).toEqual([]);
  expect(mockFake.callsTo('getPublicUrl')).toEqual([]);
});

test('flag on + a twin and no Live Avatar: the twin’s FRONT photo as a signed url, updated_at = its commit', async () => {
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  const m = await seedTwin();
  const { body } = await core();
  expect(body.data).toMatchObject({ status: 'ready', updated_at: m.committedAt, core_avatar_id: null, live_avatar: null });
  expect(body.data!.poster_url).toBe(`https://proj.supabase.co/storage/v1/object/sign/twins/${m.photos.front.path}?token=SIGNED&ttl=900`);
});

test('nothing at all → status none; storage down → 503 (not "none"); signed out → 401', async () => {
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  expect((await core()).body.data).toMatchObject({ status: 'none', poster_url: null, updated_at: null, core_avatar_id: null });
  mockFake.failNext('list', 'down', { bucket: 'twins' });
  expect((await core()).status).toBe(503);
  mockUserId = null;
  expect((await core()).status).toBe(401);
});

test('DELETE removes the Live Avatar and the legacy poster; the next read says none', async () => {
  await saveLiveAvatar(mockFake.client(), UID, { mime: 'image/jpeg', bytes: await selfie(1080, 1920), source: 'camera' });
  mockFake.put('avatars', `live-avatars/${UID}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
  const res = await DELETE(new NextRequest('https://myavatar.ge/api/avatar/core', { method: 'DELETE' }));
  expect(res.status).toBe(200);
  expect(mockFake.paths('twins')).toEqual([]);
  expect(mockFake.paths('avatars')).toEqual([]);
  expect((await core()).body.data).toMatchObject({ status: 'none' });
  mockUserId = null;
  expect((await DELETE(new NextRequest('https://myavatar.ge/api/avatar/core', { method: 'DELETE' }))).status).toBe(401);
});
