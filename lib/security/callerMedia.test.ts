/** @jest-environment node */
// Request-named media is signed with the service role only for its owner: own upload prefix, own Library row, or a
// live token. Everything else of ours is refused; other hosts come back untouched.
jest.mock('server-only', () => ({}));

const jobRows: Array<Record<string, unknown>> = [];
const likeCalls: Array<{ column: string; pattern: string; userId: string }> = [];
jest.mock('../supabase/server', () => ({
  createServiceRoleClient: () => ({
    from: () => {
      let userId = '';
      const q = {
        select: () => q,
        eq: (_c: string, v: string) => { userId = v; return q; },
        like: (column: string, pattern: string) => { likeCalls.push({ column, pattern, userId }); return q; },
        limit: async () => ({ data: jobRows.filter((r) => r.user_id === userId), error: null }),
      };
      return q;
    },
  }),
}));

import { callerMayRead, firstUnreadableOwnUrl, ownsEditingObject, ownsUploadObject, resolveCallerMedia, type CallerMediaDeps } from './callerMedia';
import { describeSupabaseObjectUrl } from '../orchestrator/storage-adapter';

const ME = '11111111-2222-4333-8444-555555555555';
const YOU = '99999999-8888-4777-8666-555555555555';
const HOST = 'https://proj.supabase.co';
const ENV = { SUPABASE_URL: HOST } as unknown as NodeJS.ProcessEnv;
const signedUrl = (bucket: string, path: string, token = 'tok') => `${HOST}/storage/v1/object/sign/${bucket}/${path}?token=${token}`;

const signs: Array<{ bucket: string; path: string; ttl: number }> = [];
const deps = (over: Partial<CallerMediaDeps> = {}): CallerMediaDeps => ({
  env: ENV,
  sign: async (bucket, path, ttl) => { signs.push({ bucket, path, ttl }); return `${signedUrl(bucket, path, 'FRESH')}`; },
  liveToken: async () => false,
  ...over,
});

beforeEach(() => { signs.length = 0; jobRows.length = 0; likeCalls.length = 0; });

describe('ownsUploadObject', () => {
  test.each([
    `omni-uploads/${ME}/1-a.png`,
    `${ME}/1-a.png`,
    `photo-studio/${ME}/1-a.png`,
    `audio-studio/${ME}/1-a.mp3`,
  ])('own: %s', (p) => expect(ownsUploadObject(p, ME)).toBe(true));

  test.each([
    `omni-uploads/${YOU}/1-a.png`,
    `${YOU}/1-a.png`,
    `photo-studio/1-a.png`, // the old, id-less chain path
    `omni-uploads/${ME}/../${YOU}/1-a.png`,
    `omni-uploads/${ME}//1-a.png`,
    `/omni-uploads/${ME}/1-a.png`,
    `omni-uploads/${ME}`,
    `renders/${ME}/1.mp4`,
    `omni-uploads/${ME}x/1.png`,
  ])('not own: %s', (p) => expect(ownsUploadObject(p, ME)).toBe(false));

  test('no user owns nothing', () => {
    expect(ownsUploadObject(`omni-uploads//1.png`, '')).toBe(false);
    expect(ownsUploadObject(`omni-uploads/null/1.png`, null)).toBe(false);
  });
});

describe('ownsEditingObject', () => {
  test('the caller\'s own editing input and output in job-artifacts', () => {
    expect(ownsEditingObject('job-artifacts', `editing-input/${ME}/1700000000000-abc123.mp4`, ME, 'input')).toBe(true);
    expect(ownsEditingObject('job-artifacts', `editing-input/${ME}/1700000000000-abc123.Mov File`, ME, 'input')).toBe(true);
    expect(ownsEditingObject('job-artifacts', `editing-output/${ME}/run/export/output_mp4_1080p.mp4`, ME, 'output')).toBe(true);
  });
  test.each([
    ['another user', 'job-artifacts', `editing-input/${YOU}/x.mp4`, 'input'],
    ['another bucket', 'uploads', `editing-input/${ME}/x.mp4`, 'input'],
    ['an output path asked as input', 'job-artifacts', `editing-output/${ME}/x.mp4`, 'input'],
    ['dot segments', 'job-artifacts', `editing-output/${ME}/../${YOU}/x.mp4`, 'output'],
    ['a double slash', 'job-artifacts', `editing-output/${ME}//x.mp4`, 'output'],
    ['a backslash', 'job-artifacts', `editing-output/${ME}/..\\x.mp4`, 'output'],
    ['a bare id with no folder', 'job-artifacts', `editing-output/${ME}`, 'output'],
    ['a non-string path', 'job-artifacts', 42, 'output'],
  ])('refuses %s', (_label, bucket, path, kind) => {
    expect(ownsEditingObject(bucket, path, ME, kind as 'input' | 'output')).toBe(false);
  });
  test('no user owns nothing', () => {
    expect(ownsEditingObject('job-artifacts', `editing-output/${ME}/x.mp4`, null, 'output')).toBe(false);
  });
});

describe('resolveCallerMedia: bare paths', () => {
  test('signs the caller’s own upload in the upload bucket', async () => {
    const r = await resolveCallerMedia(`omni-uploads/${ME}/1-a.png`, ME, 3600, deps());
    expect(r).toEqual({ ok: true, url: signedUrl('uploads', `omni-uploads/${ME}/1-a.png`, 'FRESH'), own: true });
    expect(signs).toEqual([{ bucket: 'uploads', path: `omni-uploads/${ME}/1-a.png`, ttl: 3600 }]);
  });

  test('refuses another account’s path, an id-less path and a signed-out caller, signing nothing', async () => {
    for (const [p, uid] of [[`omni-uploads/${YOU}/1-a.png`, ME], ['photo-studio/1-a.png', ME], [`omni-uploads/${ME}/1.png`, null]] as const) {
      await expect(resolveCallerMedia(p, uid, 3600, deps())).resolves.toEqual({ ok: false, reason: 'not_owner' });
    }
    expect(signs).toEqual([]);
  });

  test('a path that cannot be signed is unavailable', async () => {
    await expect(resolveCallerMedia(`${ME}/1.png`, ME, 60, deps({ sign: async () => null }))).resolves.toEqual({ ok: false, reason: 'unavailable' });
  });

  test('other schemes and junk are invalid', async () => {
    for (const v of ['data:image/png;base64,AAAA', 'file:///etc/passwd', 'gs://b/o', 'http://cdn.example.com/a.mp4', '', '   ', 42, null, 'x'.repeat(4001)]) {
      await expect(resolveCallerMedia(v, ME, 60, deps())).resolves.toEqual({ ok: false, reason: 'invalid' });
    }
  });
});

describe('resolveCallerMedia: URLs', () => {
  test('a URL on another host is returned untouched, as external', async () => {
    for (const u of ['https://cdn.example.com/a.mp4', 'https://replicate.delivery/x/out.png']) {
      await expect(resolveCallerMedia(u, ME, 60, deps())).resolves.toEqual({ ok: true, url: u, own: false });
    }
    expect(signs).toEqual([]);
  });

  test('another tenant’s *.supabase.co URL is not ours: never signed as our object at that path', async () => {
    const u = `https://other.supabase.co/storage/v1/object/sign/uploads/omni-uploads/${YOU}/1.png?token=x`;
    await expect(resolveCallerMedia(u, ME, 60, deps())).resolves.toEqual({ ok: true, url: u, own: false });
    expect(signs).toEqual([]);
  });

  test('a public URL of ours is returned as given (nothing minted)', async () => {
    const u = `${HOST}/storage/v1/object/public/music/track.mp3`;
    await expect(resolveCallerMedia(u, ME, 60, deps())).resolves.toEqual({ ok: true, url: u, own: true });
    expect(signs).toEqual([]);
  });

  test('re-signs the caller’s own upload URL even when its token expired', async () => {
    const u = signedUrl('uploads', `omni-uploads/${ME}/1.png`, 'expired');
    const r = await resolveCallerMedia(u, ME, 900, deps());
    expect(r).toEqual({ ok: true, url: signedUrl('uploads', `omni-uploads/${ME}/1.png`, 'FRESH'), own: true });
  });

  test('refuses another account’s upload URL with a dead token', async () => {
    const u = signedUrl('uploads', `omni-uploads/${YOU}/1.png`, 'expired');
    await expect(resolveCallerMedia(u, ME, 900, deps())).resolves.toEqual({ ok: false, reason: 'not_owner' });
    expect(signs).toEqual([]);
  });

  test('accepts any object of ours whose token is live right now (the caller already holds a grant)', async () => {
    const u = signedUrl('renders', 'edits/concat-1.mp4', 'live');
    const seen: string[] = [];
    const r = await resolveCallerMedia(u, ME, 900, deps({ liveToken: async (x) => { seen.push(x); return true; } }));
    expect(r).toEqual({ ok: true, url: signedUrl('renders', 'edits/concat-1.mp4', 'FRESH'), own: true });
    expect(seen).toEqual([u]);
  });

  test('accepts an id-less output the caller’s own Library row holds, token expired', async () => {
    jobRows.push({ user_id: ME, signed_url: signedUrl('renders', 'edits/concat-1.mp4', 'old'), params: {} });
    const r = await resolveCallerMedia(signedUrl('renders', 'edits/concat-1.mp4', 'old'), ME, 900, deps({ recordedFor: undefined }));
    expect(r.ok).toBe(true);
    expect(likeCalls[0]).toEqual({ column: 'signed_url', pattern: '%/renders/edits/concat-1.mp4%', userId: ME });
  });

  test('another account’s Library row does not vouch, nor does a near-miss path or an unverified manual save', async () => {
    jobRows.push({ user_id: YOU, signed_url: signedUrl('renders', 'edits/a.mp4'), params: {} });
    jobRows.push({ user_id: ME, signed_url: signedUrl('renders', 'edits/a.mp4.bak'), params: {} });
    jobRows.push({ user_id: ME, result: { url: signedUrl('renders', 'edits/b.mp4') }, params: { source: 'manual-save' } });
    for (const p of ['edits/a.mp4', 'edits/b.mp4']) {
      await expect(resolveCallerMedia(signedUrl('renders', p, 'old'), ME, 900, deps({ recordedFor: undefined }))).resolves.toEqual({ ok: false, reason: 'not_owner' });
    }
    expect(signs).toEqual([]);
  });

  test('a verified manual save vouches through result.url', async () => {
    jobRows.push({ user_id: ME, result: { url: signedUrl('renders', 'edits/b.mp4') }, params: { source: 'manual-save', storage_verified: true } });
    await expect(resolveCallerMedia(signedUrl('renders', 'edits/b.mp4', 'old'), ME, 900, deps({ recordedFor: undefined }))).resolves.toMatchObject({ ok: true });
  });

  test('the twin bucket is never signed, whatever vouches for it', async () => {
    const u = signedUrl('twins', `${ME}/voice.webm`, 'live');
    await expect(resolveCallerMedia(u, ME, 60, deps({ liveToken: async () => true, recordedFor: async () => true }))).resolves.toEqual({ ok: false, reason: 'not_owner' });
  });

  test('a signed URL with no token cannot prove a live grant', async () => {
    const ref = describeSupabaseObjectUrl(`${HOST}/storage/v1/object/sign/renders/x.mp4`)!;
    const liveToken = jest.fn(async () => true);
    await expect(callerMayRead(`${HOST}/storage/v1/object/sign/renders/x.mp4`, ref, ME, deps({ liveToken, recordedFor: async () => false }))).resolves.toBe(false);
    expect(liveToken).not.toHaveBeenCalled();
  });
});

describe('firstUnreadableOwnUrl (routes that re-sign later)', () => {
  test('finds the first signed URL of ours the caller may not read; external, public and junk entries pass', async () => {
    const values = [
      'https://cdn.example.com/a.mp4',
      `${HOST}/storage/v1/object/public/music/t.mp3`,
      signedUrl('uploads', `omni-uploads/${ME}/1.mp4`, 'old'),
      null,
      42,
      signedUrl('uploads', `omni-uploads/${YOU}/1.mp4`, 'old'),
      signedUrl('uploads', `omni-uploads/${YOU}/2.mp4`, 'old'),
    ];
    await expect(firstUnreadableOwnUrl(values, ME, deps())).resolves.toBe(5);
  });

  test('-1 when everything of ours is the caller’s (or carries a live token)', async () => {
    const values = [signedUrl('uploads', `${ME}/1.mp4`, 'old'), signedUrl('renders', 'x/clip.mp4', 'live')];
    await expect(firstUnreadableOwnUrl(values, ME, deps({ liveToken: async (u) => u.includes('live') }))).resolves.toBe(-1);
  });

  test('an http:// signed URL of ours is checked too (reSignIfInternal would sign it)', async () => {
    const u = `http://proj.supabase.co/storage/v1/object/sign/uploads/omni-uploads/${YOU}/1.mp4?token=x`;
    await expect(firstUnreadableOwnUrl([u], ME, deps())).resolves.toBe(0);
  });
});
