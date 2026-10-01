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

type Obj = { bytes: number; mimetype: string; tag: string };
type Bucket = { public: boolean; objects: Map<string, Obj> };
type Err = { message: string; statusCode?: string } | null;

const A = '11111111-2222-4333-8444-555555555555';
const B = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function fakeStorage(opts: { uploadsPublic?: boolean; failUpload?: boolean; failRemove?: boolean; shrinkOnUpload?: boolean } = {}) {
  const buckets: Record<string, Bucket> = {
    avatars: { public: true, objects: new Map() },
    uploads: { public: !!opts.uploadsPublic, objects: new Map() },
  };
  const writes: string[] = [];
  const api = (name: string) => {
    const b = buckets[name]!;
    return {
      list: async (prefix: string, o: { limit?: number; offset?: number; search?: string } = {}) => {
        const dir = prefix ? `${prefix.replace(/\/$/, '')}/` : '';
        const seen = new Map<string, { name: string; id: string | null; metadata: { size: number; mimetype: string } | null }>();
        for (const [path, obj] of b.objects) {
          if (!path.startsWith(dir)) continue;
          const rest = path.slice(dir.length);
          const slash = rest.indexOf('/');
          if (slash >= 0) seen.set(rest.slice(0, slash), { name: rest.slice(0, slash), id: null, metadata: null });
          else seen.set(rest, { name: rest, id: `id-${path}`, metadata: { size: obj.bytes, mimetype: obj.mimetype } });
        }
        let rows = [...seen.values()].sort((x, y) => x.name.localeCompare(y.name));
        if (o.search) rows = rows.filter((r) => r.name.includes(o.search!));
        const off = o.offset ?? 0;
        return { data: rows.slice(off, off + (o.limit ?? 100)), error: null as Err };
      },
      // A Blob-like answer, as supabase-js gives (size + arrayBuffer); the script must re-upload BYTES.
      download: async (path: string) => {
        const o = b.objects.get(path);
        return o
          ? { data: { size: o.bytes, type: o.mimetype, arrayBuffer: async () => new ArrayBuffer(o.bytes) }, error: null }
          : { data: null, error: { message: 'Object not found' } };
      },
      upload: async (path: string, body: unknown, o: { contentType: string; upsert: boolean }) => {
        if (opts.failUpload) return { data: null, error: { message: 'Bucket not found', statusCode: '404' } };
        if (b.objects.has(path) && !o.upsert) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
        if (!Buffer.isBuffer(body)) throw new Error('upload body must be a Buffer (a Blob drops contentType)');
        writes.push(`${name}:upload:${path}`);
        b.objects.set(path, { mimetype: o.contentType, bytes: opts.shrinkOnUpload ? 1 : body.byteLength, tag: 'copied' });
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        if (opts.failRemove) return { data: null, error: { message: 'permission denied' } };
        for (const p of paths) {
          writes.push(`${name}:remove:${p}`);
          b.objects.delete(p);
        }
        return { data: paths.map((name) => ({ name })), error: null };
      },
    };
  };
  const sb = {
    storage: {
      from: api,
      getBucket: async (id: string) => (buckets[id] ? { data: { id, public: buckets[id]!.public }, error: null } : { data: null, error: { message: 'Bucket not found' } }),
    },
  };
  const put = (bucket: string, path: string, bytes: number, mimetype: string, tag = path) => buckets[bucket]!.objects.set(path, { bytes, mimetype, tag });
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

describe('default = list only', () => {
  test('finds exactly live-avatars/<uid>/voice.* and maps each to uploads/twins/<uid>/voice.<ext>', async () => {
    const items = await mig.findLegacyVoices(seeded().sb);
    expect(items.map((i) => [i.from, i.to, i.size, i.mimetype])).toEqual([
      [`live-avatars/${A}/voice.webm`, `twins/${A}/voice.webm`, 12_000, 'audio/webm'],
      [`live-avatars/${B}/voice.m4a`, `twins/${B}/voice.m4a`, 9_000, 'audio/mp4'],
    ]);
  });

  test('without --yes nothing is written or deleted', async () => {
    const f = seeded();
    const lines: string[] = [];
    const s = await mig.run(f.sb, { log: (l) => lines.push(l) });
    expect(s).toMatchObject({ found: 2, moved: 0, failed: 0 });
    expect(f.writes).toEqual([]);
    expect(f.buckets.uploads!.objects.size).toBe(0);
    expect(lines.join('\n')).toMatch(/DRY RUN/);
  });
});

describe('--yes = copy → verify → delete the public copy', () => {
  test('moves every voice sample to the private bucket and leaves posters and strays alone', async () => {
    const f = seeded();
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ found: 2, moved: 2, alreadyPrivate: 0, failed: 0 });
    expect([...f.buckets.uploads!.objects.keys()].sort()).toEqual([`twins/${A}/voice.webm`, `twins/${B}/voice.m4a`]);
    expect(f.buckets.uploads!.objects.get(`twins/${B}/voice.m4a`)).toMatchObject({ bytes: 9_000, mimetype: 'audio/mp4' });
    expect([...f.buckets.avatars!.objects.keys()].sort()).toEqual(
      [`live-avatars/${A}/poster.jpg`, `live-avatars/${B}/poster.jpg`, 'live-avatars/not-a-user/voice.webm', `other/${A}/voice.webm`].sort(),
    );
    // Upload strictly precedes the delete, file by file.
    expect(f.writes.indexOf(`uploads:upload:twins/${A}/voice.webm`)).toBeLessThan(f.writes.indexOf(`avatars:remove:live-avatars/${A}/voice.webm`));
  });

  test('refuses outright when the target bucket is public — nothing moves', async () => {
    const f = seeded({ uploadsPublic: true });
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
    f.put('uploads', `twins/${A}/voice.webm`, 15_000, 'audio/webm', 'newer-enrollment');
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s).toMatchObject({ moved: 1, alreadyPrivate: 1, failed: 0 });
    expect(f.buckets.uploads!.objects.get(`twins/${A}/voice.webm`)!.tag).toBe('newer-enrollment');
    expect(f.buckets.avatars!.objects.has(`live-avatars/${A}/voice.webm`)).toBe(false);
  });

  test('a failed public delete is reported as a failure (re-runnable), with the private copy in place', async () => {
    const f = seeded({ failRemove: true });
    const s = await mig.run(f.sb, { yes: true, log: quiet });
    expect(s.failed).toBe(2);
    expect(s.failures[0]!.reason).toMatch(/private copy is in place/);
    expect(f.buckets.uploads!.objects.has(`twins/${A}/voice.webm`)).toBe(true);
  });
});

test('the script and the app agree on where the private sample lives', async () => {
  expect(mig.PRIVATE_BUCKET).toBe(TWIN_PRIVATE_BUCKET);
  const [item] = await mig.findLegacyVoices(seeded().sb);
  expect(item!.to).toBe(twinVoicePath(A, 'webm'));
});
