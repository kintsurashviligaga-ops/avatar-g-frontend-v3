/** @jest-environment node */
/**
 * The read side: GET /api/twin's answer, and /api/avatar/core's poster — the twin's front photo (signed, private) first,
 * the legacy public poster as the fallback, exactly as before when there is no twin or the flag is off.
 */
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));

import { FakeStorage, fileBytes } from './testing/fakeStorage';
import { getTwinStatus, resolveCorePoster, resolveLegacyPoster } from './resolve';
import { TwinStorageError, writeTwinManifest } from './store';
import { twinCapturePath } from './paths';
import { buildManifest } from './validate';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CAP = '0123456789abcdef';

let fake: FakeStorage;

async function seedTwin(opts: { voice?: boolean } = {}) {
  const photos = Object.fromEntries((['front', 'left', 'right'] as const).map((s) => {
    const path = twinCapturePath(UID, CAP, s, 'jpg');
    fake.put('twins', path, fileBytes('jpeg'), 'image/jpeg');
    return [s, { path, mime: 'image/jpeg', bytes: 4096 }];
  })) as Parameters<typeof buildManifest>[0]['photos'];
  let voice = null;
  if (opts.voice) {
    voice = { path: twinCapturePath(UID, CAP, 'voice', 'webm'), mime: 'audio/webm', bytes: 20_000 };
    fake.put('twins', voice.path, fileBytes('webm', 20_000), 'audio/webm');
  }
  const m = buildManifest({
    userId: UID, captureId: CAP, photos, voice, voiceSeconds: voice ? 13 : null, digits: '40917263',
    consent: { version: 'v-test', acceptedAt: '2026-10-02T09:59:00.000Z' }, via: 'session', now: new Date('2026-10-02T10:00:00.000Z'),
  });
  await writeTwinManifest(fake.client(), m);
  fake.calls.length = 0;
  return m;
}

function seedLegacyPoster(uid = UID) {
  fake.put('avatars', `live-avatars/${uid}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
}

beforeEach(() => {
  fake = new FakeStorage();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  expect(fake.callsTo('getPublicUrl', 'twins')).toEqual([]);
  jest.restoreAllMocks();
});

describe('getTwinStatus', () => {
  test('no twin → none, and nothing is signed', async () => {
    await expect(getTwinStatus(UID, fake.client())).resolves.toEqual({ status: 'none' });
    expect(fake.callsTo('createSignedUrl')).toEqual([]);
  });

  test('a twin → short-lived signed URLs for its own objects, voice unverified', async () => {
    const m = await seedTwin({ voice: true });
    const s = await getTwinStatus(UID, fake.client());
    expect(s).toEqual({
      status: 'ready',
      committedAt: m.committedAt,
      consentVersion: 'v-test',
      voiceVerified: false,
      expiresIn: 900,
      urls: {
        front: `https://proj.supabase.co/storage/v1/object/sign/twins/${m.photos.front.path}?token=SIGNED&ttl=900`,
        left: expect.stringContaining('/object/sign/twins/'),
        right: expect.stringContaining('/object/sign/twins/'),
        voice: expect.stringContaining(`/object/sign/twins/${m.voice!.path}`),
      },
    });
    expect(JSON.stringify(s)).not.toContain('/object/public/');
  });

  test('storage down is an error (→ 503), never "none"', async () => {
    fake.failNext('download', 'network down');
    await expect(getTwinStatus(UID, fake.client())).rejects.toBeInstanceOf(TwinStorageError);
  });
});

describe('resolveCorePoster — twin first, legacy fallback', () => {
  test('flag on + a twin → the twin’s front photo, signed, dated by its commit; the legacy poster is not even read', async () => {
    const m = await seedTwin();
    seedLegacyPoster();
    await expect(resolveCorePoster(UID, { twin: true }, fake.client())).resolves.toEqual({
      url: `https://proj.supabase.co/storage/v1/object/sign/twins/${m.photos.front.path}?token=SIGNED&ttl=900`,
      updatedAt: m.committedAt,
      source: 'twin',
    });
    expect(fake.callsTo('getPublicUrl')).toEqual([]);
    expect(fake.callsTo('list', 'avatars')).toEqual([]);
  });

  test('flag on + no twin → the legacy public poster, exactly as before', async () => {
    seedLegacyPoster();
    const legacy = await resolveLegacyPoster(UID, fake.client());
    expect(legacy!.url).toMatch(new RegExp(`^https://proj\\.supabase\\.co/storage/v1/object/public/avatars/live-avatars/${UID}/poster\\.jpg\\?v=\\d+$`));
    await expect(resolveCorePoster(UID, { twin: true }, fake.client())).resolves.toEqual({ ...legacy, source: 'legacy' });
  });

  test('flag OFF → the legacy poster even when a twin exists (the twin is not read at all)', async () => {
    await seedTwin();
    seedLegacyPoster();
    await expect(resolveCorePoster(UID, { twin: false }, fake.client())).resolves.toMatchObject({ source: 'legacy' });
    expect(fake.callsTo('download', 'twins')).toEqual([]);
    expect(fake.callsTo('createSignedUrl')).toEqual([]);
  });

  test('a twin storage failure or a tampered manifest falls back to the legacy poster (never another user’s face)', async () => {
    seedLegacyPoster();
    fake.failNext('download', 'network down', { bucket: 'twins' });
    await expect(resolveCorePoster(UID, { twin: true }, fake.client())).resolves.toMatchObject({ source: 'legacy' });

    const m = await seedTwin();
    fake.put('twins', twinCapturePath(OTHER, CAP, 'front', 'jpg'), fileBytes('jpeg'), 'image/jpeg');
    const tampered = { ...m, photos: { ...m.photos, front: { ...m.photos.front, path: twinCapturePath(OTHER, CAP, 'front', 'jpg') } } };
    fake.put('twins', `twins/${UID}/twin.json`, JSON.stringify(tampered), 'application/json');
    await expect(resolveCorePoster(UID, { twin: true }, fake.client())).resolves.toMatchObject({ source: 'legacy' });
    expect(fake.callsTo('createSignedUrl').some((c) => c.path!.includes(OTHER))).toBe(false);
  });

  test('neither → null', async () => {
    await expect(resolveCorePoster(UID, { twin: true }, fake.client())).resolves.toBeNull();
  });
});
