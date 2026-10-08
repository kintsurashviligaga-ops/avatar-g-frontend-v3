/** @jest-environment node */
jest.mock('server-only', () => ({}));
// Cut the Supabase import chain (ESM in node_modules) — URL parsing is pure.
jest.mock('../supabase/server', () => ({ createServiceRoleClient: () => { throw new Error('no client in test'); } }));

import { parseSupabaseObjectUrl } from './storage-adapter';

describe('parseSupabaseObjectUrl', () => {
  test('parses a public object URL', () => {
    const r = parseSupabaseObjectUrl('https://abc.supabase.co/storage/v1/object/public/media/clips/1.mp4');
    expect(r).toEqual({ bucket: 'media', path: 'clips/1.mp4' });
  });

  test('parses a signed object URL (drops token)', () => {
    const r = parseSupabaseObjectUrl('https://abc.supabase.co/storage/v1/object/sign/renders/a/b.mp4?token=xyz');
    expect(r).toEqual({ bucket: 'renders', path: 'a/b.mp4' });
  });

  test('returns null for external provider URLs', () => {
    expect(parseSupabaseObjectUrl('https://replicate.delivery/abc/out.mp4')).toBeNull();
    expect(parseSupabaseObjectUrl('https://files.heygen.ai/x.mp4')).toBeNull();
  });

  test('returns null for malformed input', () => {
    expect(parseSupabaseObjectUrl('not a url')).toBeNull();
    expect(parseSupabaseObjectUrl('https://abc.supabase.co/other/path')).toBeNull();
  });
});

describe('ensureBucket — the result is read, not thrown away', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ensureBucket, __resetKnownBuckets } = require('./storage-adapter') as typeof import('./storage-adapter');
  beforeEach(() => __resetKnownBuckets());
  const fake = (answers: Array<string | null | Error>) => {
    const calls: Array<{ id: string; opts: { public: boolean; fileSizeLimit?: string } }> = [];
    return {
      calls,
      sb: {
        storage: {
          createBucket: async (id: string, opts: { public: boolean; fileSizeLimit?: string }) => {
            calls.push({ id, opts });
            const a = answers.shift() ?? null;
            if (a instanceof Error) throw a;
            return { error: a === null ? null : { message: a } };
          },
        },
      },
    };
  };
  const quiet = () => jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  test('created on the first try', async () => {
    const f = fake([null]);
    await expect(ensureBucket(f.sb, 'studio', '256MB')).resolves.toBe('created');
    expect(f.calls).toEqual([{ id: 'studio', opts: { public: false, fileSizeLimit: '256MB' } }]);
  });

  test('"already exists" is success', async () => {
    await expect(ensureBucket(fake(['The resource already exists']).sb, 'studio', '256MB')).resolves.toBe('exists');
  });

  test('a per-bucket limit above the project limit → retried WITHOUT a limit (the 2026-09-29 production bug)', async () => {
    const f = fake(['The object exceeded the maximum allowed size', null]);
    await expect(ensureBucket(f.sb, 'studio', '256MB')).resolves.toBe('created');
    expect(f.calls.map((c) => c.opts)).toEqual([{ public: false, fileSizeLimit: '256MB' }, { public: false }]);
  });

  test('once a bucket is known to exist, later uploads skip the create call', async () => {
    const f = fake([null]);
    await ensureBucket(f.sb, 'renders', '256MB');
    await ensureBucket(f.sb, 'renders', '256MB');
    expect(f.calls).toHaveLength(1);
  });

  test('a failure is not cached — the next upload tries again', async () => {
    const warn = quiet();
    const f = fake(['permission denied', null]);
    await expect(ensureBucket(f.sb, 'studio')).resolves.toBe('failed');
    await expect(ensureBucket(f.sb, 'studio')).resolves.toBe('created');
    warn.mockRestore();
  });

  test('any other failure is reported (and logged), never swallowed as success', async () => {
    const warn = quiet();
    await expect(ensureBucket(fake(['permission denied']).sb, 'studio', '256MB')).resolves.toBe('failed');
    await expect(ensureBucket(fake([new Error('network down')]).sb, 'studio')).resolves.toBe('failed');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('storageObjectExists — true/false only when storage answered', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { storageObjectExists } = require('./storage-adapter') as typeof import('./storage-adapter');
  const fake = (answer: { data?: Array<{ name?: string | null }> | null; error?: { message: string } | null } | Error) => {
    const calls: Array<{ bucket: string; dir: string; opts: { limit: number; search: string } }> = [];
    return {
      calls,
      sb: {
        storage: {
          from: (bucket: string) => ({
            list: async (dir: string, opts: { limit: number; search: string }) => {
              calls.push({ bucket, dir, opts });
              if (answer instanceof Error) throw answer;
              return { data: answer.data ?? null, error: answer.error ?? null };
            },
          }),
        },
      },
    };
  };

  test('lists the folder, searching for the file name', async () => {
    const f = fake({ data: [{ name: 'pred1.glb' }] });
    await expect(storageObjectExists('renders', 'models3d/pred1.glb', f.sb)).resolves.toBe(true);
    expect(f.calls).toEqual([{ bucket: 'renders', dir: 'models3d', opts: { limit: 100, search: 'pred1.glb' } }]);
  });

  test('a pattern near-miss is not the object (search is a match, `_` a wildcard)', async () => {
    const f = fake({ data: [{ name: 'pred1.glb.bak' }, { name: 'predX1.glb' }, { name: 'PRED1.GLB' }] });
    await expect(storageObjectExists('renders', 'models3d/pred_1.glb', f.sb)).resolves.toBe(false);
  });

  test('an empty listing is a confirmed absence', async () => {
    await expect(storageObjectExists('renders', 'models3d/pred1.glb', fake({ data: [] }).sb)).resolves.toBe(false);
  });

  test('an error, a throw, or no storage client is "cannot tell" (null), never "absent"', async () => {
    await expect(storageObjectExists('renders', 'models3d/pred1.glb', fake({ error: { message: 'Bucket not found' } }).sb)).resolves.toBeNull();
    await expect(storageObjectExists('renders', 'models3d/pred1.glb', fake(new Error('ECONNRESET')).sb)).resolves.toBeNull();
    // The module-level mock makes createServiceRoleClient throw → no client.
    await expect(storageObjectExists('renders', 'models3d/pred1.glb')).resolves.toBeNull();
  });
});

describe('library filing helpers — what may be re-signed with the service role', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sa = require('./storage-adapter') as typeof import('./storage-adapter');
  const OWN = 'https://proj.supabase.co';
  const env = { NEXT_PUBLIC_SUPABASE_URL: OWN } as unknown as NodeJS.ProcessEnv;
  const isPublicUrl = () => true;
  const asFetch = (f: jest.Mock) => f as unknown as typeof fetch;

  test('describeSupabaseObjectUrl keeps the access shape, the token and the host', () => {
    expect(sa.describeSupabaseObjectUrl(`${OWN}/storage/v1/object/sign/renders/a/b.mp4?token=t1`))
      .toEqual({ bucket: 'renders', path: 'a/b.mp4', access: 'sign', token: 't1', host: 'proj.supabase.co' });
    expect(sa.describeSupabaseObjectUrl(`${OWN}/storage/v1/object/public/renders/a.mp4`))
      .toEqual({ bucket: 'renders', path: 'a.mp4', access: 'public', token: null, host: 'proj.supabase.co' });
    expect(sa.describeSupabaseObjectUrl('https://cdn.example.com/a.mp4')).toBeNull();
  });

  test('ownStorageHosts reads both env spellings; libraryMediaBuckets honours the env names and never the twin bucket', () => {
    const both = { SUPABASE_URL: 'https://A.supabase.co', NEXT_PUBLIC_SUPABASE_URL: OWN } as unknown as NodeJS.ProcessEnv;
    expect([...sa.ownStorageHosts(both)].sort()).toEqual(['a.supabase.co', 'proj.supabase.co']);
    expect(sa.ownStorageHosts({} as NodeJS.ProcessEnv).size).toBe(0);
    expect([...sa.libraryMediaBuckets({} as NodeJS.ProcessEnv)].sort()).toEqual(['renders', 'studio', 'uploads']);
    expect(sa.libraryMediaBuckets({ RENDER_BUCKET: 'films' } as unknown as NodeJS.ProcessEnv).has('films')).toBe(true);
    expect(sa.libraryMediaBuckets({ UPLOAD_BUCKET: 'twins' } as unknown as NodeJS.ProcessEnv).has('twins')).toBe(false);
  });

  test('verifyFileableUrl: a redirect from storage is not proof of access', async () => {
    const fetchImpl = jest.fn(async () => new Response(null, { status: 302, headers: { location: 'https://elsewhere' } }));
    await expect(sa.verifyFileableUrl(`${OWN}/storage/v1/object/sign/renders/a.mp4?token=t`, { env, isPublicUrl, fetchImpl: asFetch(fetchImpl) }))
      .resolves.toEqual({ ok: false, reason: 'not_readable' });
  });

  test('verifyFileableUrl: 200 and 206 both prove access; an http:// signed URL of ours is refused as unsigned', async () => {
    for (const status of [200, 206]) {
      const fetchImpl = jest.fn(async () => new Response('x', { status }));
      await expect(sa.verifyFileableUrl(`${OWN}/storage/v1/object/sign/uploads/edits/c.mp4?token=t`, { env, isPublicUrl, fetchImpl: asFetch(fetchImpl) }))
        .resolves.toEqual({ ok: true, kind: 'own-signed', bucket: 'uploads', path: 'edits/c.mp4' });
    }
    await expect(sa.verifyFileableUrl('http://proj.supabase.co/storage/v1/object/sign/renders/a.mp4?token=t', { env, isPublicUrl }))
      .resolves.toEqual({ ok: false, reason: 'unsigned' });
  });

  test('verifyFileableUrl: external URLs defer to the public-address check', async () => {
    await expect(sa.verifyFileableUrl('https://cdn.example.com/a.mp4', { env, isPublicUrl: () => false }))
      .resolves.toEqual({ ok: false, reason: 'invalid_url' });
    await expect(sa.verifyFileableUrl('https://cdn.example.com/a.mp4', { env, isPublicUrl }))
      .resolves.toEqual({ ok: true, kind: 'external' });
  });
});
