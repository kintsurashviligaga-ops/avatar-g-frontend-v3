/** @jest-environment node */
/**
 * GET /api/avatar/core — with NEXT_PUBLIC_TWIN_ENABLED the poster is the twin's front photo (a SIGNED url, dated by the
 * commit); otherwise — or without a twin — the legacy public poster exactly as before. The response shape is unchanged.
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
import { GET } from './route';
import { FakeStorage, fileBytes } from '../../../../lib/twin/testing/fakeStorage';
import { twinCapturePath } from '../../../../lib/twin/paths';
import { writeTwinManifest } from '../../../../lib/twin/store';
import { buildManifest } from '../../../../lib/twin/validate';

const UID = '11111111-2222-4333-8444-555555555555';
const CAP = '0123456789abcdef';
const ENV = { ...process.env };

const core = async () => {
  const res = await GET(new NextRequest('https://myavatar.ge/api/avatar/core'));
  return { status: res.status, body: (await res.json()) as { data?: { status: string; poster_url: string | null; updated_at: string | null } } };
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
  delete process.env.NEXT_PUBLIC_TWIN_ENABLED;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(mockFake.callsTo('getPublicUrl', 'twins')).toEqual([]);
  process.env = { ...ENV };
  jest.restoreAllMocks();
});

test('flag off: the legacy public poster, exactly as before — even if a twin exists', async () => {
  await seedTwin();
  mockFake.put('avatars', `live-avatars/${UID}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
  const { status, body } = await core();
  expect(status).toBe(200);
  expect(body.data).toMatchObject({ status: 'ready', core_avatar_id: null, model_glb_url: null });
  expect(body.data!.poster_url).toMatch(new RegExp(`/object/public/avatars/live-avatars/${UID}/poster\\.jpg\\?v=\\d+$`));
});

test('flag on + a twin: the twin’s FRONT photo as a signed url, updated_at = its commit (the desktop’s phone poll sees it)', async () => {
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  const m = await seedTwin();
  mockFake.put('avatars', `live-avatars/${UID}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
  const { body } = await core();
  expect(body.data).toMatchObject({ status: 'ready', updated_at: m.committedAt });
  expect(body.data!.poster_url).toBe(`https://proj.supabase.co/storage/v1/object/sign/twins/${m.photos.front.path}?token=SIGNED&ttl=900`);
  expect(mockFake.callsTo('getPublicUrl')).toEqual([]);
});

test('flag on + no twin: falls back to the legacy poster', async () => {
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  mockFake.put('avatars', `live-avatars/${UID}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
  const { body } = await core();
  expect(body.data!.poster_url).toContain(`/object/public/avatars/live-avatars/${UID}/poster.jpg`);
});

test('nothing at all → status none; signed out → 401', async () => {
  process.env.NEXT_PUBLIC_TWIN_ENABLED = '1';
  expect((await core()).body.data).toMatchObject({ status: 'none', poster_url: null, updated_at: null });
  mockUserId = null;
  expect((await core()).status).toBe(401);
});
