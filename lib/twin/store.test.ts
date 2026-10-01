/** @jest-environment node */
/**
 * The twin store against an in-memory storage fake: uploads only ever target staging, a commit validates the COPIES it
 * keeps (size, MIME, bytes), DELETE erases every path in both buckets, the used-link store is atomic — and nothing is
 * ever given a public URL.
 */
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));

import { FakeStorage, fileBytes } from './testing/fakeStorage';
import {
  CAPTURE_GRACE_MS,
  TwinStorageError,
  __resetTwinBucketCheck,
  assertTwinBucketPrivate,
  captureIdAgeMs,
  newCaptureId,
  clearStaging,
  deleteTwinData,
  promoteCapture,
  pruneTwinCaptures,
  readTwinManifest,
  signStagingUploads,
  signTwinUrls,
  twinHandoffJtiStore,
  writeTwinManifest,
} from './store';
import { twinCapturePath, twinManifestPath, twinStagingPath } from './paths';
import { buildManifest } from './validate';
import type { CaptureTicket } from './ticket';
import { twinVoicePath } from '../avatar/twinStorage';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const TICKET: CaptureTicket = { v: 1, u: UID, d: '40917263', s: { front: 'jpg', left: 'jpg', right: 'jpg', voice: 'webm' }, iat: 0, exp: 1 };

let fake: FakeStorage;
const sb = () => fake.client();

/** What the browser does with the signed upload URLs. */
function stageAll(uid = UID, over: Partial<Record<'front' | 'left' | 'right' | 'voice', { bytes: Uint8Array; type: string } | null>> = {}) {
  const def = { front: { bytes: fileBytes('jpeg'), type: 'image/jpeg' }, left: { bytes: fileBytes('jpeg'), type: 'image/jpeg' }, right: { bytes: fileBytes('jpeg'), type: 'image/jpeg' }, voice: { bytes: fileBytes('webm', 20_000), type: 'audio/webm' } };
  for (const slot of ['front', 'left', 'right', 'voice'] as const) {
    const v = slot in over ? over[slot] : def[slot];
    if (v) fake.put('twins', twinStagingPath(uid, slot, TICKET.s[slot]!), v.bytes, v.type);
  }
}

const noPublicUrlForTwins = () => expect(fake.callsTo('getPublicUrl', 'twins')).toEqual([]);

beforeEach(() => {
  fake = new FakeStorage();
  __resetTwinBucketCheck();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  noPublicUrlForTwins();
  jest.restoreAllMocks();
});

describe('signed uploads target staging only', () => {
  test('one upsert-able signed upload per slot, in the private bucket, at the derived staging path', async () => {
    const uploads = await signStagingUploads(sb(), UID, TICKET.s);
    expect(uploads).toEqual({
      front: { path: `twins/${UID}/staging/front.jpg`, token: `upload-token:twins/twins/${UID}/staging/front.jpg` },
      left: { path: `twins/${UID}/staging/left.jpg`, token: expect.any(String) },
      right: { path: `twins/${UID}/staging/right.jpg`, token: expect.any(String) },
      voice: { path: `twins/${UID}/staging/voice.webm`, token: expect.any(String) },
    });
    expect(fake.callsTo('createSignedUploadUrl').map((c) => [c.bucket, c.opts])).toEqual(Array(4).fill(['twins', { upsert: true }]));
  });

  test('clearing staging removes only staging (never the twin, its manifest or the Live voice sample)', async () => {
    fake.put('twins', twinStagingPath(UID, 'front', 'jpg'), fileBytes('jpeg'), 'image/jpeg');
    fake.put('twins', twinManifestPath(UID), '{}', 'application/json');
    fake.put('twins', twinCapturePath(UID, '0123456789abcdef', 'front', 'jpg'), fileBytes('jpeg'), 'image/jpeg');
    fake.put('twins', twinVoicePath(UID, 'webm'), fileBytes('webm'), 'audio/webm');
    fake.put('twins', twinStagingPath(OTHER, 'front', 'jpg'), fileBytes('jpeg'), 'image/jpeg');
    await clearStaging(sb(), UID);
    expect(fake.paths('twins')).toEqual([
      twinStagingPath(OTHER, 'front', 'jpg'),
      twinManifestPath(UID),
      twinCapturePath(UID, '0123456789abcdef', 'front', 'jpg'),
      twinVoicePath(UID, 'webm'),
    ].sort());
  });
});

describe('promoteCapture — copy, then validate the copies', () => {
  test('a good capture lands in a fresh twin-<id> folder, voice included', async () => {
    stageAll();
    const r = await promoteCapture(sb(), UID, TICKET);
    if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
    expect(r.captureId).toMatch(/^[0-9a-f]{16}$/);
    expect(r.photos.front).toEqual({ path: twinCapturePath(UID, r.captureId, 'front', 'jpg'), mime: 'image/jpeg', bytes: 4096 });
    expect(r.voice).toEqual({ path: twinCapturePath(UID, r.captureId, 'voice', 'webm'), mime: 'audio/webm', bytes: 20_000 });
    expect(fake.callsTo('copy').map((c) => c.to)).toEqual(['front', 'left', 'right', 'voice'].map((s) => twinCapturePath(UID, r.captureId, s as 'front', s === 'voice' ? 'webm' : 'jpg')));
  });

  test('voice is optional: no staged voice → a photo-only twin', async () => {
    stageAll(UID, { voice: null });
    const r = await promoteCapture(sb(), UID, TICKET);
    expect(r).toMatchObject({ ok: true, voice: null });
  });

  test('what is validated is the COPY: junk written into a copy is refused, even though staging was clean', async () => {
    stageAll();
    fake.afterCopy = (bucket, _from, to) => { if (to.endsWith('/left.jpg')) fake.put(bucket, to, fileBytes('html'), 'image/jpeg'); };
    const r = await promoteCapture(sb(), UID, TICKET);
    expect(r).toEqual({ ok: false, status: 415, error: 'content_mismatch', slot: 'left' });
  });

  test('…and staging rewritten after the copy (a still-valid upload URL) cannot change what is kept', async () => {
    stageAll();
    fake.afterCopy = (bucket, from) => fake.put(bucket, from, fileBytes('html'), 'image/jpeg');
    const r = await promoteCapture(sb(), UID, TICKET);
    if (!r.ok) throw new Error('expected ok');
    expect(Array.from(fake.get('twins', r.photos.front.path)!.bytes.slice(0, 3))).toEqual([0xff, 0xd8, 0xff]);
  });

  test('MIME: a photo stored as SVG is 415, and neither the copies nor staging are kept', async () => {
    stageAll(UID, { right: { bytes: fileBytes('svg'), type: 'image/svg+xml' } });
    const r = await promoteCapture(sb(), UID, TICKET);
    expect(r).toEqual({ ok: false, status: 415, error: 'unsupported_type', slot: 'right' });
    expect(fake.paths('twins')).toEqual([]);
  });

  test('MIME: HTML labelled image/jpeg is 415', async () => {
    stageAll(UID, { front: { bytes: fileBytes('html'), type: 'image/jpeg' } });
    expect(await promoteCapture(sb(), UID, TICKET)).toMatchObject({ ok: false, status: 415, error: 'content_mismatch', slot: 'front' });
    expect(fake.paths('twins')).toEqual([]);
  });

  test('size: an oversized staged photo is 413 before a single byte is copied or downloaded', async () => {
    stageAll(UID, { left: { bytes: fileBytes('jpeg', 5 * 1024 * 1024), type: 'image/jpeg' } });
    expect(await promoteCapture(sb(), UID, TICKET)).toEqual({ ok: false, status: 413, error: 'too_large', slot: 'left' });
    expect(fake.callsTo('copy')).toEqual([]);
    expect(fake.callsTo('download')).toEqual([]);
    expect(fake.paths('twins')).toEqual([]);
  });

  test('size: an empty voice file is 400', async () => {
    stageAll(UID, { voice: { bytes: fileBytes('webm', 100), type: 'audio/webm' } });
    expect(await promoteCapture(sb(), UID, TICKET)).toMatchObject({ ok: false, status: 400, error: 'too_small', slot: 'voice' });
  });

  test('a missing photo is 400 and nothing is copied', async () => {
    stageAll(UID, { left: null });
    expect(await promoteCapture(sb(), UID, TICKET)).toEqual({ ok: false, status: 400, error: 'missing_photo', slot: 'left' });
    expect(fake.callsTo('copy')).toEqual([]);
  });

  test('a ticket for someone else promotes nothing', async () => {
    stageAll();
    expect(await promoteCapture(sb(), UID, { ...TICKET, u: OTHER })).toMatchObject({ ok: false, error: 'ticket_mismatch' });
    expect(fake.callsTo('copy')).toEqual([]);
  });

  test('a storage failure mid-copy throws (→ 503) and leaves no half-made capture behind; staging stays for a retry', async () => {
    stageAll();
    fake.failNext('copy', 'boom', { pathIncludes: 'right' });
    await expect(promoteCapture(sb(), UID, TICKET)).rejects.toBeInstanceOf(TwinStorageError);
    expect(fake.paths('twins').every((p) => p.includes('/staging/'))).toBe(true);
    expect(fake.paths('twins')).toHaveLength(4);
  });
});

describe('the manifest', () => {
  const manifest = (cap: string) =>
    buildManifest({
      userId: UID,
      captureId: cap,
      photos: {
        front: { path: twinCapturePath(UID, cap, 'front', 'jpg'), mime: 'image/jpeg', bytes: 4096 },
        left: { path: twinCapturePath(UID, cap, 'left', 'jpg'), mime: 'image/jpeg', bytes: 4096 },
        right: { path: twinCapturePath(UID, cap, 'right', 'jpg'), mime: 'image/jpeg', bytes: 4096 },
      },
      voice: null,
      voiceSeconds: null,
      digits: '40917263',
      consent: { version: 'v-test', acceptedAt: '2026-10-02T09:59:00.000Z' },
      via: 'session',
      now: new Date('2026-10-02T10:00:00.000Z'),
    });

  test('written as private JSON at the derived path, never cached, and read back exactly', async () => {
    const m = manifest('0123456789abcdef');
    await writeTwinManifest(sb(), m);
    expect(fake.callsTo('upload')).toEqual([
      { bucket: 'twins', op: 'upload', path: twinManifestPath(UID), opts: { contentType: 'application/json', upsert: true, cacheControl: '0' } },
    ]);
    await expect(readTwinManifest(sb(), UID)).resolves.toEqual(m);
  });

  test('absent → null WITHOUT a download: supabase-js reports a missing download as an opaque "{}" error, no status', async () => {
    await expect(readTwinManifest(sb(), UID)).resolves.toBeNull();
    expect(fake.callsTo('download')).toEqual([]);
    // The client's real answer for a missing object — nothing in it says "not found":
    await expect(sb().storage.from('twins').download(twinManifestPath(UID))).resolves.toEqual({ data: null, error: { message: '{}' } });
    fake.failNext('list', 'network down');
    await expect(readTwinManifest(sb(), UID)).rejects.toBeInstanceOf(TwinStorageError);
  });

  test('corrupt or tampered → null (treated as no twin); a listed manifest that cannot be read → throws', async () => {
    fake.put('twins', twinManifestPath(UID), '{not json', 'application/json');
    await expect(readTwinManifest(sb(), UID)).resolves.toBeNull();
    const tampered = manifest('0123456789abcdef');
    tampered.photos.front.path = twinCapturePath(OTHER, '0123456789abcdef', 'front', 'jpg');
    fake.put('twins', twinManifestPath(UID), JSON.stringify(tampered), 'application/json');
    await expect(readTwinManifest(sb(), UID)).resolves.toBeNull();
    fake.failNext('download', 'network down');
    await expect(readTwinManifest(sb(), UID)).rejects.toBeInstanceOf(TwinStorageError);
  });

  test('signing: short-lived signed URLs for the owner’s own paths only', async () => {
    const m = manifest('0123456789abcdef');
    for (const s of ['front', 'left', 'right'] as const) fake.put('twins', m.photos[s].path, fileBytes('jpeg'), 'image/jpeg');
    const urls = await signTwinUrls(sb(), m, 900);
    expect(urls.front).toBe(`https://proj.supabase.co/storage/v1/object/sign/twins/${m.photos.front.path}?token=SIGNED&ttl=900`);
    expect(urls.voice).toBeNull();
    const forged = { ...m, photos: { ...m.photos, left: { ...m.photos.left, path: twinCapturePath(OTHER, '0123456789abcdef', 'left', 'jpg') } } };
    await expect(signTwinUrls(sb(), forged)).rejects.toThrow(/owner prefix/);
    expect(fake.callsTo('createSignedUrl').some((c) => c.path!.includes(OTHER))).toBe(false);
  });

  test('capture ids are 16 hex chars that carry their own age', () => {
    const now = Date.parse('2026-10-02T10:00:00.000Z');
    const id = newCaptureId(now);
    expect(id).toMatch(/^[0-9a-f]{16}$/);
    expect(captureIdAgeMs(id, now + 5000)).toBe(5000);
    expect(newCaptureId(now)).not.toBe(id);
  });

  test('pruning keeps the LIVE capture, the manifest, the Live voice and a young (in-flight) folder; drops the replaced capture, old leftovers and staging', async () => {
    const now = Date.parse('2026-10-02T10:00:00.000Z');
    const live = newCaptureId(now);
    const replaced = newCaptureId(now - 2000);
    const leftover = newCaptureId(now - CAPTURE_GRACE_MS - 1000);
    const inFlight = newCaptureId(now - 1000); // another commit promoted this and has not written its manifest yet
    await writeTwinManifest(sb(), manifest(live));
    for (const cap of [live, replaced, leftover, inFlight]) fake.put('twins', twinCapturePath(UID, cap, 'front', 'jpg'), fileBytes('jpeg'), 'image/jpeg');
    fake.put('twins', twinStagingPath(UID, 'voice', 'webm'), fileBytes('webm'), 'audio/webm');
    fake.put('twins', twinVoicePath(UID, 'webm'), fileBytes('webm'), 'audio/webm');
    await pruneTwinCaptures(sb(), UID, { previous: replaced, now });
    expect(fake.paths('twins')).toEqual([
      twinManifestPath(UID),
      twinCapturePath(UID, live, 'front', 'jpg'),
      twinCapturePath(UID, inFlight, 'front', 'jpg'),
      twinVoicePath(UID, 'webm'),
    ].sort());
  });

  test('two overlapping commits: a prune that runs before the other’s manifest lands never removes the folder it will point at', async () => {
    const now = Date.parse('2026-10-02T10:00:00.000Z');
    const a = newCaptureId(now);
    const b = newCaptureId(now);
    for (const cap of [a, b]) for (const s of ['front', 'left', 'right'] as const) fake.put('twins', twinCapturePath(UID, cap, s, 'jpg'), fileBytes('jpeg'), 'image/jpeg');
    await writeTwinManifest(sb(), manifest(a)); // A switched…
    await pruneTwinCaptures(sb(), UID, { previous: null, now }); // …and pruned, while B is still between promote and switch
    await writeTwinManifest(sb(), manifest(b)); // B switches
    await expect(signTwinUrls(sb(), (await readTwinManifest(sb(), UID))!)).resolves.toMatchObject({ front: expect.stringContaining(`twin-${b}`) });
  });
});

describe('deleteTwinData — erases every path, in both buckets, and nobody else’s', () => {
  test('twins/<uid>/** and the legacy live-avatars/<uid>/**, manifest first', async () => {
    const mine = [
      twinManifestPath(UID),
      twinCapturePath(UID, '0123456789abcdef', 'front', 'jpg'),
      twinCapturePath(UID, '0123456789abcdef', 'voice', 'webm'),
      twinStagingPath(UID, 'left', 'jpg'),
      twinVoicePath(UID, 'm4a'),
    ];
    for (const p of mine) fake.put('twins', p, fileBytes('jpeg'), 'image/jpeg');
    fake.put('avatars', `live-avatars/${UID}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
    fake.put('avatars', `live-avatars/${UID}/voice.webm`, fileBytes('webm'), 'audio/webm');
    const theirs = [twinManifestPath(OTHER), twinCapturePath(OTHER, '0123456789abcdef', 'front', 'jpg')];
    for (const p of theirs) fake.put('twins', p, fileBytes('jpeg'), 'image/jpeg');
    fake.put('avatars', `live-avatars/${OTHER}/poster.jpg`, fileBytes('jpeg'), 'image/jpeg');
    fake.put('twins', 'handoff/AbCdEfGhIjKlMnOpQrStUv', '1', 'text/plain');

    await expect(deleteTwinData(sb(), UID)).resolves.toEqual({ twins: 5, legacy: 2 });
    expect(fake.paths('twins')).toEqual([...theirs, 'handoff/AbCdEfGhIjKlMnOpQrStUv'].sort());
    expect(fake.paths('avatars')).toEqual([`live-avatars/${OTHER}/poster.jpg`]);
    expect(fake.callsTo('remove', 'twins')[0]!.paths).toEqual([twinManifestPath(UID)]);
    expect(fake.callsTo('getPublicUrl')).toEqual([]);
  });

  test('nothing there → removes nothing and says so', async () => {
    await expect(deleteTwinData(sb(), UID)).resolves.toEqual({ twins: 0, legacy: 0 });
  });

  test('a storage failure is an error, never a reported success', async () => {
    fake.put('twins', twinManifestPath(UID), '{}', 'application/json');
    fake.failNext('remove', 'boom');
    await expect(deleteTwinData(sb(), UID)).rejects.toBeInstanceOf(TwinStorageError);
    fake.failNext('list', 'boom', { bucket: 'avatars' });
    await expect(deleteTwinData(sb(), UID)).rejects.toBeInstanceOf(TwinStorageError);
  });
});

describe('the bucket must report private', () => {
  test('private passes (and is remembered); public or missing is refused', async () => {
    await expect(assertTwinBucketPrivate(sb())).resolves.toBeUndefined();
    __resetTwinBucketCheck();
    fake.bucketMeta.set('twins', { public: true });
    await expect(assertTwinBucketPrivate(sb())).rejects.toMatchObject({ op: 'bucket_public' });
    fake.bucketMeta.set('twins', null);
    await expect(assertTwinBucketPrivate(sb())).rejects.toMatchObject({ op: 'bucket_unavailable' });
  });
});

describe('used phone-handoff links (single use)', () => {
  const JTI = 'AbCdEfGhIjKlMnOpQrStUv';

  test('the first claim wins, every later one is "used"; a release lets the same link be retried', async () => {
    const store = twinHandoffJtiStore(sb());
    await expect(store.isClaimed(JTI)).resolves.toBe(false);
    await expect(store.claim(JTI, 123)).resolves.toBe('claimed');
    await expect(store.claim(JTI, 123)).resolves.toBe('used');
    await expect(store.isClaimed(JTI)).resolves.toBe(true);
    await store.release(JTI);
    await expect(store.claim(JTI, 123)).resolves.toBe('claimed');
    expect(fake.callsTo('upload').every((c) => c.bucket === 'twins' && c.path === `handoff/${JTI}` && c.opts!.upsert === false)).toBe(true);
  });

  test('a store that cannot answer throws (fail closed) and isClaimed says "cannot tell"', async () => {
    const store = twinHandoffJtiStore(sb());
    fake.failNext('upload', 'network down');
    await expect(store.claim(JTI, 1)).rejects.toBeInstanceOf(TwinStorageError);
    fake.failNext('list', 'network down');
    await expect(store.isClaimed(JTI)).resolves.toBeNull();
  });

  test('a malformed token id never becomes a path', async () => {
    const store = twinHandoffJtiStore(sb());
    await expect(store.claim('../../twins/x', 1)).rejects.toThrow();
    expect(fake.callsTo('upload')).toEqual([]);
  });
});
