/** @jest-environment node */
jest.mock('server-only', () => ({}));

// A fake service-role client that records which bucket every storage call went to. Only storage is faked;
// the DB "richness" writes in enrollSelfieAvatar get an `{ error }` answer, which is exactly prod's shape.
type Call = { bucket: string; op: 'upload' | 'getPublicUrl' | 'remove' | 'createBucket' | 'getBucket'; path: string; contentType?: string; public?: boolean };
const calls: Call[] = [];
let uploadError: { message: string } | null = null;
let removeError: { message: string } | null = null;
/** State of the twin bucket as the fake project reports it: missing (create succeeds), private, or public. */
let twinBucket: 'missing' | 'private' | 'public' = 'missing';
let getBucketError: { message: string } | null = null;
const mockClient = {
  storage: {
    createBucket: jest.fn(async (id: string, opts: { public: boolean }) => {
      calls.push({ bucket: id, op: 'createBucket', path: '', public: opts.public });
      if (twinBucket !== 'missing') return { data: null, error: { message: 'The resource already exists' } };
      twinBucket = opts.public ? 'public' : 'private';
      return { data: { name: id }, error: null };
    }),
    getBucket: jest.fn(async (id: string) => {
      calls.push({ bucket: id, op: 'getBucket', path: '' });
      if (getBucketError) return { data: null, error: getBucketError };
      if (twinBucket === 'missing') return { data: null, error: { message: 'Bucket not found' } };
      return { data: { id, public: twinBucket === 'public' }, error: null };
    }),
    from: (bucket: string) => ({
      upload: jest.fn(async (path: string, _buf: Buffer, opts: { contentType?: string }) => {
        calls.push({ bucket, op: 'upload', path, contentType: opts?.contentType });
        return { error: uploadError };
      }),
      remove: jest.fn(async (paths: string[]) => {
        for (const p of paths) calls.push({ bucket, op: 'remove', path: p });
        return { data: [], error: removeError };
      }),
      getPublicUrl: jest.fn((path: string) => {
        calls.push({ bucket, op: 'getPublicUrl', path });
        return { data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
      }),
    }),
  },
  from: () => ({
    insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: 'relation "avatar_assets" does not exist' } }) }) }),
  }),
};
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => mockClient }));

import { enrollSelfieAvatar, storeLiveAvatarVoice, TWIN_PRIVATE_BUCKET, twinVoicePath } from './enroll';
import { __resetKnownBuckets } from '../orchestrator/storage-adapter';

const UID = '11111111-2222-4333-8444-555555555555';
const bytes = (n: number) => Buffer.alloc(n, 7).toString('base64');
const voiceUrl = (type: string, n = 1024) => `data:${type};base64,${bytes(n)}`;
const writes = () => calls.filter((c) => c.op === 'upload' || c.op === 'remove');

beforeEach(() => {
  calls.length = 0;
  uploadError = null;
  removeError = null;
  getBucketError = null;
  twinBucket = 'missing';
  __resetKnownBuckets();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the voice sample is a voiceprint — it lands only in the dedicated private twin bucket', () => {
  test('writes to the private `twins` bucket at twins/<uid>/voice.<ext>, and never asks for a public URL', async () => {
    const r = await storeLiveAvatarVoice(UID, voiceUrl('audio/webm'));
    expect(r).toEqual({ ok: true, bucket: 'twins', path: `twins/${UID}/voice.webm` });
    expect(calls.filter((c) => c.op === 'upload')).toEqual([
      { bucket: 'twins', op: 'upload', path: `twins/${UID}/voice.webm`, contentType: 'audio/webm' },
    ]);
    expect(calls.some((c) => c.op === 'getPublicUrl')).toBe(false);
    expect(calls.some((c) => c.bucket === 'avatars' || c.bucket === 'uploads')).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/\/public\//);
  });

  test('NOT `uploads` — the bucket whose bare paths many routes sign for any signed-in caller', () => {
    expect(TWIN_PRIVATE_BUCKET).toBe('twins');
    expect(TWIN_PRIVATE_BUCKET).not.toBe('uploads');
  });

  test('a missing twin bucket is self-provisioned PRIVATE before the first write', async () => {
    await storeLiveAvatarVoice(UID, voiceUrl('audio/webm'));
    expect(calls[0]).toEqual({ bucket: 'twins', op: 'createBucket', path: '', public: false });
    expect(calls.findIndex((c) => c.op === 'createBucket')).toBeLessThan(calls.findIndex((c) => c.op === 'upload'));
  });

  test('an existing PRIVATE twin bucket is used as-is', async () => {
    twinBucket = 'private';
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/webm'))).resolves.toMatchObject({ ok: true, bucket: 'twins' });
    expect(calls.some((c) => c.op === 'getBucket')).toBe(true);
  });

  test('an existing PUBLIC twin bucket is refused — nothing is written, and it is said loudly', async () => {
    twinBucket = 'public';
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/webm'))).resolves.toEqual({ ok: false });
    expect(writes()).toEqual([]);
    expect(String((console.error as jest.Mock).mock.calls[0]?.[0])).toMatch(/PUBLIC/);
  });

  test('a twin bucket whose state cannot be read is not written to', async () => {
    twinBucket = 'private';
    getBucketError = { message: 'network down' };
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/webm'))).resolves.toEqual({ ok: false });
    expect(writes()).toEqual([]);
  });

  test('the bucket is pinned even when UPLOAD_BUCKET points elsewhere', async () => {
    const prev = process.env.UPLOAD_BUCKET;
    process.env.UPLOAD_BUCKET = 'avatars';
    try {
      await storeLiveAvatarVoice(UID, voiceUrl('audio/mp4'));
    } finally {
      if (prev === undefined) delete process.env.UPLOAD_BUCKET;
      else process.env.UPLOAD_BUCKET = prev;
    }
    expect(calls.filter((c) => c.op === 'upload')).toEqual([
      { bucket: 'twins', op: 'upload', path: twinVoicePath(UID, 'm4a'), contentType: 'audio/mp4' },
    ]);
  });

  test('codec-qualified MediaRecorder types still store (gated on the base type)', async () => {
    const r = await storeLiveAvatarVoice(UID, voiceUrl('audio/webm;codecs=opus'));
    expect(r.ok).toBe(true);
    expect(calls.find((c) => c.op === 'upload')).toMatchObject({ bucket: 'twins', path: `twins/${UID}/voice.webm`, contentType: 'audio/webm' });
  });

  test('rejected input touches no storage at all', async () => {
    await expect(storeLiveAvatarVoice(UID, voiceUrl('image/png'))).resolves.toEqual({ ok: false });
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/webm', 10))).resolves.toEqual({ ok: false });
    await expect(storeLiveAvatarVoice(UID, 'not a data url')).resolves.toEqual({ ok: false });
    expect(calls).toEqual([]);
  });

  test('an upload error is reported as { ok:false }, never thrown, never retried into a public bucket, nothing removed', async () => {
    uploadError = { message: 'Bucket not found' };
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/ogg'))).resolves.toEqual({ ok: false });
    expect(writes()).toEqual([{ bucket: 'twins', op: 'upload', path: twinVoicePath(UID, 'ogg'), contentType: 'audio/ogg' }]);
  });
});

describe('one current voiceprint per user — a re-enroll from another browser leaves no stale sibling', () => {
  test('after the new sample lands, every other-extension sample of THIS user is removed', async () => {
    const r = await storeLiveAvatarVoice(UID, voiceUrl('audio/mp4'));
    expect(r).toMatchObject({ ok: true, path: twinVoicePath(UID, 'm4a') });
    expect(writes()).toEqual([
      { bucket: 'twins', op: 'upload', path: twinVoicePath(UID, 'm4a'), contentType: 'audio/mp4' },
      ...['webm', 'mp3', 'ogg', 'wav'].map((e) => ({ bucket: 'twins', op: 'remove', path: twinVoicePath(UID, e) })),
    ]);
  });

  test('a failed cleanup never fails the save — the new sample is stored', async () => {
    removeError = { message: 'permission denied' };
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/webm'))).resolves.toEqual({ ok: true, bucket: 'twins', path: twinVoicePath(UID, 'webm') });
  });
});

describe('the poster stays public until Wave 3 (the Live orb reads it by public URL)', () => {
  test('selfie → avatars/live-avatars/<uid>/poster.jpg; no voice write rides along', async () => {
    const r = await enrollSelfieAvatar(UID, `data:image/jpeg;base64,${bytes(2048)}`);
    expect(r.ok).toBe(true);
    expect(calls.filter((c) => c.op === 'upload')).toEqual([
      { bucket: 'avatars', op: 'upload', path: `live-avatars/${UID}/poster.jpg`, contentType: 'image/jpeg' },
    ]);
    expect(calls.filter((c) => c.op === 'getPublicUrl').map((c) => c.path)).toEqual([`live-avatars/${UID}/poster.jpg`]);
  });
});
