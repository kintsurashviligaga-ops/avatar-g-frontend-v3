/** @jest-environment node */
jest.mock('server-only', () => ({}));

// A fake service-role client that records which bucket every storage call went to. Only storage is faked;
// the DB "richness" writes in enrollSelfieAvatar get an `{ error }` answer, which is exactly prod's shape.
type Call = { bucket: string; op: 'upload' | 'getPublicUrl'; path: string; contentType?: string };
const calls: Call[] = [];
let uploadError: { message: string } | null = null;
const mockClient = {
  storage: {
    from: (bucket: string) => ({
      upload: jest.fn(async (path: string, _buf: Buffer, opts: { contentType?: string }) => {
        calls.push({ bucket, op: 'upload', path, contentType: opts?.contentType });
        return { error: uploadError };
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

const UID = '11111111-2222-4333-8444-555555555555';
const bytes = (n: number) => Buffer.alloc(n, 7).toString('base64');
const voiceUrl = (type: string, n = 1024) => `data:${type};base64,${bytes(n)}`;

beforeEach(() => {
  calls.length = 0;
  uploadError = null;
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the voice sample is a voiceprint — it never lands in a public bucket', () => {
  test('writes to the private `uploads` bucket at twins/<uid>/voice.<ext>, and never asks for a public URL', async () => {
    const r = await storeLiveAvatarVoice(UID, voiceUrl('audio/webm'));
    expect(r).toEqual({ ok: true, bucket: 'uploads', path: `twins/${UID}/voice.webm` });
    expect(calls).toEqual([{ bucket: 'uploads', op: 'upload', path: `twins/${UID}/voice.webm`, contentType: 'audio/webm' }]);
    expect(calls.some((c) => c.op === 'getPublicUrl')).toBe(false);
    expect(calls.some((c) => c.bucket === 'avatars')).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/\/public\//);
  });

  test('the bucket is pinned to `uploads` even when UPLOAD_BUCKET points elsewhere', async () => {
    const prev = process.env.UPLOAD_BUCKET;
    process.env.UPLOAD_BUCKET = 'avatars';
    try {
      await storeLiveAvatarVoice(UID, voiceUrl('audio/mp4'));
    } finally {
      if (prev === undefined) delete process.env.UPLOAD_BUCKET;
      else process.env.UPLOAD_BUCKET = prev;
    }
    expect(TWIN_PRIVATE_BUCKET).toBe('uploads');
    expect(calls).toEqual([{ bucket: 'uploads', op: 'upload', path: twinVoicePath(UID, 'm4a'), contentType: 'audio/mp4' }]);
  });

  test('codec-qualified MediaRecorder types still store (gated on the base type)', async () => {
    const r = await storeLiveAvatarVoice(UID, voiceUrl('audio/webm;codecs=opus'));
    expect(r.ok).toBe(true);
    expect(calls[0]).toMatchObject({ bucket: 'uploads', path: `twins/${UID}/voice.webm`, contentType: 'audio/webm' });
  });

  test('rejected input touches no storage at all', async () => {
    await expect(storeLiveAvatarVoice(UID, voiceUrl('image/png'))).resolves.toEqual({ ok: false });
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/webm', 10))).resolves.toEqual({ ok: false });
    await expect(storeLiveAvatarVoice(UID, 'not a data url')).resolves.toEqual({ ok: false });
    expect(calls).toEqual([]);
  });

  test('an upload error is reported as { ok:false }, never thrown, never retried into a public bucket', async () => {
    uploadError = { message: 'Bucket not found' };
    await expect(storeLiveAvatarVoice(UID, voiceUrl('audio/ogg'))).resolves.toEqual({ ok: false });
    expect(calls.map((c) => c.bucket)).toEqual(['uploads']);
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
