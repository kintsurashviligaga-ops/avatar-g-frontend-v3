/**
 * lib/twin/testing/fakeStorage.ts — TEST-ONLY: an in-memory stand-in for supabase-js storage, just the calls the twin
 * store makes. Like supabase-js it ANSWERS `{ data, error }` and never throws: a missing object is `Object not found`,
 * a create over an existing name without upsert is `The resource already exists` (409), a list returns folders as
 * `{ id: null, metadata: null }`. Every call is recorded (`calls`) so a test can assert what was — and was not — done.
 * Imported by no production code.
 */
import type { StorageEntry, TwinStorageClient } from '../store';

export interface FakeObject {
  bytes: Uint8Array;
  contentType: string;
  updatedAt: string;
}

export type FakeOp =
  | 'upload'
  | 'download'
  | 'list'
  | 'remove'
  | 'copy'
  | 'createSignedUrl'
  | 'createSignedUploadUrl'
  | 'getPublicUrl'
  | 'getBucket';

export interface FakeCall {
  bucket: string;
  op: FakeOp;
  path?: string;
  paths?: string[];
  to?: string;
  opts?: Record<string, unknown>;
}

type Err = { message: string; statusCode?: string };

export class FakeStorage {
  objects = new Map<string, Map<string, FakeObject>>();
  bucketMeta = new Map<string, { public: boolean } | null>([
    ['twins', { public: false }],
    ['avatars', { public: true }],
  ]);
  calls: FakeCall[] = [];
  /** Runs after every successful copy — lets a test rewrite staging (or the copy) mid-commit. */
  afterCopy: ((bucket: string, from: string, to: string) => void) | null = null;
  private failures: Array<{ op: FakeOp; message: string; bucket?: string; pathIncludes?: string; landed?: boolean }> = [];
  private clock = Date.parse('2026-10-02T10:00:00.000Z');

  bucket(name: string): Map<string, FakeObject> {
    if (!this.objects.has(name)) this.objects.set(name, new Map());
    return this.objects.get(name)!;
  }

  put(bucket: string, path: string, bytes: Uint8Array | string, contentType = 'application/octet-stream'): void {
    const b = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
    this.clock += 1000;
    this.bucket(bucket).set(path, { bytes: b, contentType, updatedAt: new Date(this.clock).toISOString() });
  }

  get(bucket: string, path: string): FakeObject | undefined {
    return this.bucket(bucket).get(path);
  }

  paths(bucket: string): string[] {
    return [...this.bucket(bucket).keys()].sort();
  }

  /**
   * The next `op` (optionally only on `bucket` / a path containing `pathIncludes`) answers `{ error: { message } }`.
   * `landed: true` (upload only) performs the write and STILL answers the error — a lost response.
   */
  failNext(op: FakeOp, message = 'injected failure', where: { bucket?: string; pathIncludes?: string; landed?: boolean } = {}): void {
    this.failures.push({ op, message, ...where });
  }

  callsTo(op: FakeOp, bucket?: string): FakeCall[] {
    return this.calls.filter((c) => c.op === op && (bucket === undefined || c.bucket === bucket));
  }

  private failure(op: FakeOp, bucket: string, path = ''): (Err & { landed?: boolean }) | null {
    const i = this.failures.findIndex((f) => f.op === op && (!f.bucket || f.bucket === bucket) && (!f.pathIncludes || path.includes(f.pathIncludes)));
    if (i < 0) return null;
    const [f] = this.failures.splice(i, 1);
    return { message: f!.message, ...(f!.landed ? { landed: true } : {}) };
  }

  private listDir(bucket: string, dir: string): StorageEntry[] {
    const prefix = dir ? `${dir.replace(/\/$/, '')}/` : '';
    const files = new Map<string, StorageEntry>();
    const folders = new Set<string>();
    for (const [path, obj] of this.bucket(bucket)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash >= 0) folders.add(rest.slice(0, slash));
      else
        files.set(rest, {
          name: rest,
          id: `id:${bucket}/${path}`,
          updated_at: obj.updatedAt,
          created_at: obj.updatedAt,
          metadata: { size: obj.bytes.byteLength, mimetype: obj.contentType },
        });
    }
    const folderEntries: StorageEntry[] = [...folders].map((name) => ({ name, id: null, updated_at: null, created_at: null, metadata: null }));
    return [...folderEntries, ...files.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  client(): TwinStorageClient {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const fake = this;
    return {
      storage: {
        async getBucket(id: string) {
          fake.calls.push({ bucket: id, op: 'getBucket' });
          const err = fake.failure('getBucket', id);
          if (err) return { data: null, error: err };
          const meta = fake.bucketMeta.get(id);
          return meta ? { data: { ...meta }, error: null } : { data: null, error: { message: 'Bucket not found' } };
        },
        from(bucket: string) {
          return {
            async upload(path: string, body: Buffer, opts: { contentType: string; upsert: boolean; cacheControl?: string }) {
              fake.calls.push({ bucket, op: 'upload', path, opts: { ...opts } });
              const err = fake.failure('upload', bucket, path);
              if (err?.landed) fake.put(bucket, path, new Uint8Array(body), opts.contentType);
              if (err) return { error: { message: err.message } };
              if (!opts.upsert && fake.bucket(bucket).has(path)) return { error: { message: 'The resource already exists', statusCode: '409' } };
              fake.put(bucket, path, new Uint8Array(body), opts.contentType);
              return { error: null };
            },
            download(path: string) {
              fake.calls.push({ bucket, op: 'download', path });
              const err = fake.failure('download', bucket, path);
              if (err) return Promise.resolve({ data: null, error: err });
              const obj = fake.bucket(bucket).get(path);
              if (!obj) return Promise.resolve({ data: null, error: { message: 'Object not found', statusCode: '404' } });
              return Promise.resolve({ data: new Blob([obj.bytes as BlobPart], { type: obj.contentType }), error: null });
            },
            async list(dir: string, opts: { limit?: number; offset?: number; search?: string } = {}) {
              fake.calls.push({ bucket, op: 'list', path: dir, opts: { ...opts } });
              const err = fake.failure('list', bucket, dir);
              if (err) return { data: null, error: err };
              let entries = fake.listDir(bucket, dir);
              if (opts.search) entries = entries.filter((e) => e.name.startsWith(opts.search!));
              const offset = opts.offset ?? 0;
              return { data: entries.slice(offset, offset + (opts.limit ?? 100)), error: null };
            },
            async remove(paths: string[]) {
              fake.calls.push({ bucket, op: 'remove', paths: [...paths] });
              const err = fake.failure('remove', bucket, paths.join(','));
              if (err) return { error: err };
              for (const p of paths) fake.bucket(bucket).delete(p);
              return { error: null };
            },
            async copy(from: string, to: string) {
              fake.calls.push({ bucket, op: 'copy', path: from, to });
              const err = fake.failure('copy', bucket, from);
              if (err) return { error: err };
              const obj = fake.bucket(bucket).get(from);
              if (!obj) return { error: { message: 'Object not found', statusCode: '404' } };
              if (fake.bucket(bucket).has(to)) return { error: { message: 'The resource already exists', statusCode: '409' } };
              fake.put(bucket, to, obj.bytes.slice(), obj.contentType);
              fake.afterCopy?.(bucket, from, to);
              return { error: null };
            },
            async createSignedUrl(path: string, expiresIn: number) {
              fake.calls.push({ bucket, op: 'createSignedUrl', path, opts: { expiresIn } });
              const err = fake.failure('createSignedUrl', bucket, path);
              if (err) return { data: null, error: err };
              if (!fake.bucket(bucket).has(path)) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
              return { data: { signedUrl: `https://proj.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=SIGNED&ttl=${expiresIn}` }, error: null };
            },
            async createSignedUploadUrl(path: string, opts: { upsert: boolean }) {
              fake.calls.push({ bucket, op: 'createSignedUploadUrl', path, opts: { ...opts } });
              const err = fake.failure('createSignedUploadUrl', bucket, path);
              if (err) return { data: null, error: err };
              return { data: { token: `upload-token:${bucket}/${path}`, signedUrl: `https://proj.supabase.co/storage/v1/object/upload/sign/${bucket}/${path}?token=UP`, path }, error: null };
            },
            getPublicUrl(path: string) {
              fake.calls.push({ bucket, op: 'getPublicUrl', path });
              return { data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
            },
          };
        },
      },
    };
  }
}

/** Bytes that sniff as each type (a real signature followed by padding). */
export function fileBytes(kind: 'jpeg' | 'png' | 'webp' | 'webm' | 'ogg' | 'm4a' | 'html' | 'svg', size = 4096): Uint8Array {
  const b = new Uint8Array(size);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => { b[at + i] = c.charCodeAt(0); });
  switch (kind) {
    case 'jpeg': b.set([0xff, 0xd8, 0xff, 0xe0]); break;
    case 'png': b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); break;
    case 'webp': ascii(0, 'RIFF'); ascii(8, 'WEBP'); break;
    case 'webm': b.set([0x1a, 0x45, 0xdf, 0xa3]); break;
    case 'ogg': ascii(0, 'OggS'); break;
    case 'm4a': ascii(4, 'ftypM4A '); break;
    case 'html': ascii(0, '<!doctype html><script>alert(1)</script>'); break;
    case 'svg': ascii(0, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'); break;
  }
  return b;
}
