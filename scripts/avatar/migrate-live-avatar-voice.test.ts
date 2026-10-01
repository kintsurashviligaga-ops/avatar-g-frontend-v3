/** @jest-environment node */
// The owner-run migration, exercised against an in-memory storage that answers like supabase-js: every call
// RESOLVES with `{ data, error }`, folders list with `id: null`. No network, no Supabase client.
jest.mock('server-only', () => ({}));
jest.mock('../../lib/supabase/server', () => ({ createServiceRoleClient: () => { throw new Error('no client in test'); } }));

import * as migModule from './migrate-live-avatar-voice.mjs';
import { TWIN_PRIVATE_BUCKET, twinVoicePath } from '../../lib/avatar/enroll';

const mig = migModule as unknown as {
  findLegacyVoices: (sb: unknown) => Promise<Array<{ uid: string; ext: string; from: string; to: string; size: number | null; mimetype: string }>>;
  run: (sb: unknown, o?: { yes?: boolean; log?: (s: string) => void }) => Promise<{ found: number; moved: number; alreadyPrivate: number; failed: number; failures: Array<{ from: string; reason: string }> }>;
  PRIVATE_BUCKET: string;
};

type Obj = { bytes: number; mimetype: string; tag: string; updatedAt: string };
type Bucket = { public: boolean; objects: Map<string, Obj> };
type Err = { message: string; statusCode?: string } | null;

const A = '11111111-2222-4333-8444-555555555555';
const B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const P = 'twins'; // the private target; asserted equal to the app's constant below

function fakeStorage(opts: { twinsPublic?: boolean; twinsMissing?: boolean; failUpload?: boolean; failRemove?: boolean; shrinkOnUpload?: boolean } = {}) {
  const buckets: Record<string, Bucket> = { avatars: { public: true, objects: new Map() } };
  if (!opts.twinsMissing) buckets[P] = { public: !!opts.twinsPublic, objects: new Map() };
  const writes: string[] = [];
  const api = (name: string) => {
    const bucket = () => buckets[name];
    return {
      list: async (prefix: string, o: { limit?: number; offset?: number; search?: string } = {}) => {
        const b = bucket();
        if (!b) return { data: null, error: { message: 'Bucket not found' } as Err };
        const dir = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
        const seen = new Map<string, { name: string; id: string | null; updated_at: string | null; metadata: { size: number; mimetype: string } | null }>();
        for (const [path, obj] of b.objects) {
          if (!path.startsWith(dir)) continue;
          const rest = path.slice(dir.length);
          const slash = rest.indexOf('/');
          if (slash >= 0) seen.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null, updated_at: null, metadata: null });
          else seen.set(rest, { name: rest, id: `id-${path}`, updated_at: obj.updatedAt, metadata: { size: obj.bytes, mimetype: obj.mimetype } });
        }
        let rows = [...seen.values()].sort((x, y) => x.name.localeCompare(y.name));
        if (o.search) rows = rows.filter((r) => r.name.includes(o.search!));
        const off = o.offset ?? 0;
        return { data: rows.slice(off, off + (o.limit ?? 100)), error: null as Err };
      },
      // A Blob-like answer, as supabase-js gives (size + arrayBuffer); the script must re-upload BYTES.
      download: async (path: string) => {
        const o = bucket()?.objects.get(path);
        return o
          ? { data: { size: o.bytes, type: o.mimetype, arrayBuffer: async () => new ArrayBuffer(o.bytes) }, error: null }
          : { data: null, error: { message: 'Object not found' } };
      },
      upload: async (path: string, body: unknown, o: { contentType: string; upsert: boolean }) => {
        const b = bucket();
        if (opts.failUpload || !b) return { data: null, error: { message: 'Bucket not found', statusCode: '404' } };
        if (b.objects.has(path) && !o.upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
        if (!Buffer.isBuffer(body)) throw new Error('upload body must be a Buffer (a Blob drops contentType)');
        writes.push(`${name}:upload:${path}`);
        b.objects.set(path, { mimetype: o.contentType, bytes: opts.shrinkOnUpload ? 1 : body.byteLength, tag: 'copied', updatedAt: '2026-10-01T00:00:00Z' });
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        if (opts.failRemove) return { data: null, error: { message: 'permission denied' } };
        for (const p of paths) {
          writes.push(`${name}:remove:${p}`);
          bucket()?.objects.delete(p);
        }
        return { data: paths.map((n) => ({ name: n })), error: null };
      },
    };
  };
  const sb = {
    storage: {
      from: api,
      getBucket: async (id: string) => (buckets[id] ? { data: { id, public: buckets[id]!.public }, error: null } : { data: null, error: { message: 'Bucket not found' } }),
      createBucket: async (id: string, o: { public: boolean }) => {
        if (buckets[id]) return { data: null, error: { message: 'The resource already exists' } };
        writes.push(`createBucket:${id}:public=${o.public}`);
        buckets[id] = { public: o.public, objects: new Map() };
        return { data: { name: id }, error: null };
      },
    },
  };
  const put = (bucket: string, path: string, bytes: number, mimetype: string, tag = path, updatedAt = '2026-01-01T00:00:00Z') =>
    buckets[bucket]!.objects.set(path, { bytes, mimetype, tag, updatedAt });
  return { sb, buckets, writes, put };
}

function seeded(opts?: Parameters<typeof fakeStorage>[0]) {
  const f = fakeStorage(opts);
  f.put('avatars', `live-avatars/${A}/poster.jpg`, 50_000, 'image/jpeg');
  f.put('avatars', `live-avatars/${A}/voice.webm`, 12_000, 'audio/webm');
  f.put('avatars', `live-avatars/${B}/poster.jpg`, 40_000, 'image/jpeg');
  f.put('avatars', `live-avatars/${B}/voice.m4a`, 9_000, 'audio/mp4');
  f.put('avatars', `live-avatars/not-a-user/voice.webm`, 5_000, 'audio/webm'); // not a uid → never touched
  f.put('avatars', `other/${A}/voice.webm`, 5_000, 'audio/webm'); // outside live-avatars → never touched
  return f;
}
const quiet = () => undefined;
const privateKeys = (f: ReturnType<typeof fakeStorage>) => [...(f.buckets[P]?.objects.keys() ?? [])].sort();

describe('default = list only', () => {
  test('finds exactly live-avatars/<uid>/voice.* and maps each to twins/<uid>/voice.<ext> in the twin bucket', async () => {
    const items = await mig.findLegacyVoices(seeded().sb);
    expect(items.map((i) => [i.from, i.to, i.size, i.mimetype])).toEqual([
      [`live-avatars/${A}/voice.webm`, `twins/${A}/voice.webm`, 12_000, 'audio/webm'],
      [`live-avatars/${B}/voice.m4a`, `twins/${B}/voice.m4a`, 9_000, 'audio/mp4'],
    ]);
  });

  test('without --yes nothing is written, deleted, or created (not even the bucket)', async () => {
    const f = seeded({ twinsMissing: true });
    const lines: string[] = [];
    const s = await mig.run(f.sb, { log: (l) => lines.push(l) });
    expect(s).toMatchObject({ found: 2, moved: 0, failed: 0 });
    expect(f.writes).toEqual([]);
    expect(f.buckets[P]).toBeUndefined();
    expect(lines.join('\n')).toMatch(/DRY RUN/);
  });
});

describe('--yes = copy → verify → delete the public copy', () => {
  test('moves every voice sample to the private twin bucket and leaves posters and strays alone', async () => {
    const f = seeded();
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ found: 2, moved: 2, alreadyPrivate: 0, failed: 0 });
    expect(privateKeys(f)).toEqual([`twins/${A}/voice.webm`, `twins/${B}/voice.m4a`]);
    expect(f.buckets[P]!.objects.get(`twins/${B}/voice.m4a`)).toMatchObject({ bytes: 9_000, mimetype: 'audio/mp4' });
    expect([...f.buckets.avatars!.objects.keys()].sort()).toEqual(
      [`live-avatars/${A}/poster.jpg`, `live-avatars/${B}/poster.jpg`, 'live-avatars/not-a-user/voice.webm', `other/${A}/voice.webm`].sort(),
    );
    // Upload strictly precedes the delete, file by file.
    expect(f.writes.indexOf(`${P}:upload:twins/${A}/voice.webm`)).toBeLessThan(f.writes.indexOf(`avatars:remove:live-avatars/${A}/voice.webm`));
  });

  test('a missing twin bucket is created PRIVATE before the first copy', async () => {
    const f = seeded({ twinsMissing: true });
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ moved: 2, failed: 0 });
    expect(f.writes[0]).toBe(`createBucket:${P}:public=false`);
    expect(f.buckets[P]!.public).toBe(false);
  });

  test('refuses outright when the target bucket is public — nothing moves', async () => {
    const f = seeded({ twinsPublic: true });
    await expect(mig.run(f.sb, { yes: true, log: quiet })).rejects.toThrow(/PUBLIC/);
    expect(f.writes).toEqual([]);
  });

  test('a failed upload never deletes the public copy', async () => {
    const f = seeded({ failUpload: true });
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ moved: 0, failed: 2 });
    expect(f.buckets.avatars!.objects.has(`live-avatars/${A}/voice.webm`)).toBe(true);
    expect(f.writes.some((w) => w.includes(':remove:'))).toBe(false);
  });

  test('a private copy that does not match in size blocks the delete', async () => {
    const f = seeded({ shrinkOnUpload: true });
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s.failed).toBe(2);
    expect(s.failures[0]!.reason).toMatch(/size mismatch/);
    expect(f.buckets.avatars!.objects.has(`live-avatars/${A}/voice.webm`)).toBe(true);
  });

  test('an existing private copy (earlier run / newer enrollment) is kept, and the public one still goes', async () => {
    const f = seeded();
    f.put(P, `twins/${A}/voice.webm`, 15_000, 'audio/webm', 'newer-enrollment');
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ moved: 1, alreadyPrivate: 1, failed: 0 });
    expect(f.buckets[P]!.objects.get(`twins/${A}/voice.webm`)!.tag).toBe('newer-enrollment');
    expect(f.buckets.avatars!.objects.has(`live-avatars/${A}/voice.webm`)).toBe(false);
  });

  test('a private sample of ANOTHER extension also counts: no stale copy lands beside it', async () => {
    const f = seeded();
    f.put(P, `twins/${A}/voice.m4a`, 15_000, 'audio/mp4', 'newer-enrollment'); // re-enrolled on Safari after Wave 1
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ moved: 1, alreadyPrivate: 1, failed: 0 });
    expect(privateKeys(f)).toEqual([`twins/${A}/voice.m4a`, `twins/${B}/voice.m4a`]);
    expect(f.writes).not.toContain(`${P}:upload:twins/${A}/voice.webm`);
    expect(f.buckets.avatars!.objects.has(`live-avatars/${A}/voice.webm`)).toBe(false);
  });

  test('two legacy samples for one user → the NEWEST is copied, the stale one is only deleted', async () => {
    const f = seeded();
    f.put('avatars', `live-avatars/${A}/voice.m4a`, 20_000, 'audio/mp4', 'newest', '2026-06-01T00:00:00Z');
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ found: 3, moved: 2, alreadyPrivate: 1, failed: 0 });
    expect(privateKeys(f)).toEqual([`twins/${A}/voice.m4a`, `twins/${B}/voice.m4a`]);
    expect(f.buckets[P]!.objects.get(`twins/${A}/voice.m4a`)).toMatchObject({ bytes: 20_000 });
    expect([...f.buckets.avatars!.objects.keys()].filter((k) => k.startsWith(`live-avatars/${A}/voice.`))).toEqual([]);
  });

  test('a failed public delete is reported as a failure (re-runnable), with the private copy in place', async () => {
    const f = seeded({ failRemove: true });
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s.failed).toBe(2);
    expect(s.failures[0]!.reason).toMatch(/private copy is in place/);
    expect(f.buckets[P]!.objects.has(`twins/${A}/voice.webm`)).toBe(true);
  });
});

test('the script and the app agree on where the private sample lives — a dedicated bucket, never `uploads`', async () => {
  expect(mig.PRIVATE_BUCKET).toBe(TWIN_PRIVATE_BUCKET);
  expect(mig.PRIVATE_BUCKET).toBe(P);
  expect(mig.PRIVATE_BUCKET).not.toBe('uploads');
  const [item] = await mig.findLegacyVoices(seeded().sb);
  expect(item!.to).toBe(twinVoicePath(A, 'webm'));
});
