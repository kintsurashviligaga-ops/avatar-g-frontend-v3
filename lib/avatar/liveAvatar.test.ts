/** @jest-environment node */
/**
 * The saved Live Avatar against the in-memory storage fake: private bucket only, a stable id, the manifest as the
 * active pointer (written last), owner isolation, delete, and the old public poster moved in and removed.
 */
jest.mock('server-only', () => ({}));
jest.mock('../supabase/server', () => ({ createServiceRoleClient: jest.fn() }));

import sharp from 'sharp';
import { FakeStorage } from '../twin/testing/fakeStorage';
import { __resetTwinBucketCheck } from '../twin/store';
import {
  customAvatarAccess,
  deleteLiveAvatar,
  describeLiveAvatar,
  liveAvatarManifestPath,
  liveAvatarState,
  readLiveAvatar,
  resolveLiveAvatar,
  saveLiveAvatar,
} from './liveAvatar';

const UID = '11111111-2222-4333-8444-555555555555';
const OTHER = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const T0 = new Date('2026-10-24T20:00:00.000Z');
const later = (min: number) => new Date(T0.getTime() + min * 60_000);

let fake: FakeStorage;
const sb = () => fake.client();
const selfie = (w = 1080, h = 1920) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 150, b: 120 } } }).jpeg().toBuffer();

beforeEach(() => {
  fake = new FakeStorage();
  __resetTwinBucketCheck();
  delete process.env.VERTEX_LIVE_CUSTOM_AVATAR;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => {
  // Nothing biometric is ever given a public URL.
  expect(fake.callsTo('getPublicUrl')).toEqual([]);
  jest.restoreAllMocks();
});

test('a save: photo + portrait in a fresh private folder, then the manifest; it reads back the same after a "refresh"', async () => {
  const saved = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, T0);
  if (!saved.ok) throw new Error(saved.error);
  const m = saved.manifest;
  expect(m.avatarId).toMatch(/^[0-9a-f]{16}$/);
  expect(fake.paths('twins')).toEqual([
    `twins/${UID}/live-avatar-${m.avatarId}/custom.png`,
    `twins/${UID}/live-avatar-${m.avatarId}/photo.jpg`,
    liveAvatarManifestPath(UID),
  ]);
  expect(fake.paths('avatars')).toEqual([]);
  const uploads = fake.callsTo('upload').map((c) => c.path);
  expect(uploads[uploads.length - 1]).toBe(liveAvatarManifestPath(UID)); // the switch goes last
  expect(m).toMatchObject({ userId: UID, createdAt: T0.toISOString(), source: 'camera', prep: { ok: true } });
  expect(await readLiveAvatar(sb(), UID)).toEqual(m);
});

test('another save is a new id; the older folder is removed; a concurrent save inside the grace window is kept', async () => {
  const a = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, T0);
  const b = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'upload' }, later(10));
  if (!a.ok || !b.ok) throw new Error('save');
  expect(b.manifest.avatarId).not.toBe(a.manifest.avatarId);
  expect(fake.paths('twins').some((p) => p.includes(a.manifest.avatarId))).toBe(false);
  expect((await readLiveAvatar(sb(), UID))?.avatarId).toBe(b.manifest.avatarId);
});

test('a manifest upload that fails leaves the old avatar active and removes the half-written folder', async () => {
  const a = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, T0);
  if (!a.ok) throw new Error('save');
  fake.failNext('upload', 'boom', { pathIncludes: 'live-avatar.json' });
  const b = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, later(5));
  expect(b).toEqual({ ok: false, status: 503, error: 'storage_unavailable' });
  expect((await readLiveAvatar(sb(), UID))?.avatarId).toBe(a.manifest.avatarId);
  expect(fake.paths('twins').filter((p) => p.endsWith('photo.jpg'))).toEqual([a.manifest.photo.path]);
});

test('a PUBLIC twins bucket is refused before anything is written', async () => {
  fake.bucketMeta.set('twins', { public: true });
  const r = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, T0);
  expect(r).toEqual({ ok: false, status: 503, error: 'storage_unavailable' });
  expect(fake.paths('twins')).toEqual([]);
});

test('a bad photo is refused with its reason and nothing is stored', async () => {
  const r = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: Buffer.from('<html>'.padEnd(4096, ' ')), source: 'upload' }, T0);
  expect(r).toEqual({ ok: false, status: 415, error: 'content_mismatch' });
  expect(fake.paths('twins')).toEqual([]);
});

test('isolation: a manifest naming another user\'s object reads as no avatar, and is never signed', async () => {
  const a = await saveLiveAvatar(sb(), OTHER, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, T0);
  if (!a.ok) throw new Error('save');
  const forged = { ...a.manifest, userId: UID };
  fake.put('twins', liveAvatarManifestPath(UID), JSON.stringify(forged), 'application/json');
  expect(await readLiveAvatar(sb(), UID)).toBeNull();
  expect(fake.callsTo('createSignedUrl')).toEqual([]);
});

test('signed URLs only, for the owner\'s own objects, short-lived', async () => {
  const a = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, T0);
  if (!a.ok) throw new Error('save');
  const view = await describeLiveAvatar(sb(), a.manifest);
  expect(view.photoUrl).toBe(`https://proj.supabase.co/storage/v1/object/sign/twins/${a.manifest.photo.path}?token=SIGNED&ttl=3600`);
  expect(view).toMatchObject({ id: a.manifest.avatarId, state: 'custom_unavailable', customAccess: 'unavailable', custom: { width: 1080, height: 1920 } });
  expect(JSON.stringify({ ...view, photoUrl: '' })).not.toContain('live-avatar-'); // no storage paths beyond the signed URL itself
  expect(Object.keys(view)).not.toContain('path');
});

test('the old public poster: moved private on its owner\'s first read, then removed from the public bucket', async () => {
  fake.put('avatars', `live-avatars/${UID}/poster.jpg`, new Uint8Array(await selfie(720, 720)), 'image/jpeg');
  fake.put('avatars', `live-avatars/${OTHER}/poster.jpg`, new Uint8Array(await selfie(720, 720)), 'image/jpeg');
  const m = await resolveLiveAvatar(sb(), UID);
  expect(m).toMatchObject({ source: 'legacy', prep: { ok: false, reasons: ['too_small'] } });
  expect(fake.paths('avatars')).toEqual([`live-avatars/${OTHER}/poster.jpg`]);
  expect(await resolveLiveAvatar(sb(), UID)).toEqual(m); // second read: the private one, no new move
});

test('nothing saved and no poster → null; storage down → an error (503), never "none"', async () => {
  expect(await resolveLiveAvatar(sb(), UID)).toBeNull();
  fake.failNext('list', 'down', { bucket: 'twins' });
  await expect(readLiveAvatar(sb(), UID)).rejects.toThrow('twin storage');
});

test('delete: the manifest first, then every live-avatar folder and the legacy poster; the voice and the twin stay', async () => {
  const a = await saveLiveAvatar(sb(), UID, { mime: 'image/jpeg', bytes: await selfie(), source: 'camera' }, T0);
  if (!a.ok) throw new Error('save');
  fake.put('twins', `twins/${UID}/voice.webm`, 'v', 'audio/webm');
  fake.put('twins', `twins/${UID}/twin.json`, '{}', 'application/json');
  fake.put('avatars', `live-avatars/${UID}/poster.jpg`, 'x', 'image/jpeg');
  await deleteLiveAvatar(sb(), UID);
  expect(fake.callsTo('remove', 'twins')[0]!.paths).toEqual([liveAvatarManifestPath(UID)]);
  expect(fake.paths('twins')).toEqual([`twins/${UID}/twin.json`, `twins/${UID}/voice.webm`]);
  expect(fake.paths('avatars')).toEqual([]);
  expect(await readLiveAvatar(sb(), UID)).toBeNull();
});

test('the three states the owner asked for', () => {
  expect(customAvatarAccess(undefined)).toBe('unavailable');
  expect(customAvatarAccess('allowlisted')).toBe('available');
  const base = { prep: { ok: true, reasons: [], faceChecked: false } } as unknown as Parameters<typeof liveAvatarState>[0];
  expect(liveAvatarState(null)).toBe('none');
  expect(liveAvatarState({ ...base!, prep: { ok: false, reasons: ['too_small'], faceChecked: false } }, 'available')).toBe('saved_photo');
  expect(liveAvatarState(base, 'unavailable')).toBe('custom_unavailable');
  expect(liveAvatarState(base, 'available')).toBe('custom_ready');
});
