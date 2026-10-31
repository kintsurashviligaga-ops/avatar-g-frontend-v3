/** @jest-environment node */
/**
 * The read side: GET /api/twin's answer — short-lived signed URLs for the caller's own twin, never "none" on an outage.
 * (/api/avatar/core's poster is covered by its own route test: the saved Live Avatar first, then the twin's face.)
 */
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));

import { FakeStorage, fileBytes } from './testing/fakeStorage';
import { getTwinStatus } from './resolve';
import { TwinStorageError, writeTwinManifest } from './store';
import { twinCapturePath } from './paths';
import { buildManifest } from './validate';

const UID = '11111111-2222-4333-8444-555555555555';
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
    fake.failNext('list', 'network down');
    await expect(getTwinStatus(UID, fake.client())).rejects.toBeInstanceOf(TwinStorageError);
    await seedTwin();
    fake.failNext('download', 'network down');
    await expect(getTwinStatus(UID, fake.client())).rejects.toBeInstanceOf(TwinStorageError);
  });
});
