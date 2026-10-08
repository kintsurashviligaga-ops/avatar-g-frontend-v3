/**
 * Cloud storage adapter (server-only) — the Cloud_Storage_Agent realized on
 * the existing Supabase Storage bucket layer (no extra GCS infra).
 *
 * Every internal media fragment that crosses the swarm is referenced by a
 * 15-minute cryptographic signed URL (createSignedUrl(path, 900)), honoring
 * the brief's time-bound link contract while reusing the storage we already
 * run. Degrades cleanly (returns null) when Storage is unconfigured.
 */

import 'server-only';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isTwinBucket } from '@/lib/avatar/twinStorage';
import { storageContentType } from '@/lib/uploads/policy';

export const SIGNED_URL_TTL_SEC = 900; // 15 minutes

/** The bucket browsers upload into (UPLOAD_BUCKET, default `uploads`) — capped at 50 MB, media types only. */
export function isUserUploadBucket(bucket: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return bucket === ((env.UPLOAD_BUCKET && env.UPLOAD_BUCKET.trim()) || 'uploads');
}

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/** Best-effort delete of scratch objects (e.g. single-use lip-sync inputs) so they never bloat the
 *  bucket. Fail-open no-op when storage is unconfigured; a miss is harmless (objects expire on TTL). */
type BucketApi = {
  storage: {
    createBucket: (id: string, opts: { public: boolean; fileSizeLimit?: string }) => Promise<{ error: { message: string } | null }>;
  };
};

/**
 * Make sure a private bucket exists before an upload — idempotent.
 *
 * ⚠️ THE STUDIO'S RESULTS NEVER REACHED A USER BECAUSE THIS USED TO BE `try { createBucket(...) } catch {}`.
 * supabase-js does not THROW on failure, it RETURNS `{ error }` — so the catch never fired and every failure
 * was silent. And it did fail: a per-bucket `fileSizeLimit` above the project's GLOBAL upload limit is refused
 * with "The object exceeded the maximum allowed size". The `studio` bucket was therefore never created; every
 * finished generation was copied to a bucket that did not exist ("Bucket not found") and sat in `finalizing`
 * with the user already charged (found by the first real end-to-end run, 2026-09-29).
 *
 * Now: "already exists" is success; a limit the project refuses is retried WITHOUT a per-bucket limit (the
 * bucket then inherits the global one); anything else is logged, and the upload reports the real failure.
 */
/** Buckets this instance has seen exist — an upload does not pay a create round-trip (or two) every time. */
const knownBuckets = new Set<string>();

export async function ensureBucket(sb: BucketApi, bucket: string, fileSizeLimit?: string): Promise<'created' | 'exists' | 'failed'> {
  if (knownBuckets.has(bucket)) return 'exists';
  const result = await createOnce(sb, bucket, fileSizeLimit);
  if (result !== 'failed') knownBuckets.add(bucket);
  return result;
}

/** Test seam: forget what this instance has seen. */
export function __resetKnownBuckets(): void {
  knownBuckets.clear();
}

async function createOnce(sb: BucketApi, bucket: string, fileSizeLimit?: string): Promise<'created' | 'exists' | 'failed'> {
  const attempt = async (limit?: string) => {
    try {
      const { error } = await sb.storage.createBucket(bucket, limit ? { public: false, fileSizeLimit: limit } : { public: false });
      return error ? error.message : null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  let err = await attempt(fileSizeLimit);
  if (err === null) return 'created';
  if (/already exists|duplicate/i.test(err)) return 'exists';
  if (fileSizeLimit && /maximum allowed size|exceeded|too large/i.test(err)) {
    err = await attempt(undefined);
    if (err === null) return 'created';
    if (/already exists|duplicate/i.test(err)) return 'exists';
  }
  // eslint-disable-next-line no-console
  console.warn(`[storage] could not create bucket ${bucket}:`, err);
  return 'failed';
}

export async function removeStorageObjects(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const sb = client();
  if (!sb) return;
  try { await sb.storage.from(bucket).remove(paths); } catch { /* ignore */ }
}

/**
 * ⚠️ BIOMETRIC DENY-LIST — these signers never mint a URL for the twin bucket (voiceprints; posters in
 * Wave 3). Many callers hand them a CLIENT-chosen object: a bare path (signed in `uploads`) or, through
 * reSignIfInternal / the library re-sign, a bucket parsed straight out of a client-supplied URL — so without
 * this any signed-in caller could name `twins/<victim uid>/voice.webm` and get it back signed by the service
 * role. A twin reader signs on its own, scoped to the caller's own uid (lib/avatar/twinStorage.ts).
 */
function refuseTwin(bucket: string): boolean {
  if (!isTwinBucket(bucket)) return false;
  // eslint-disable-next-line no-console
  console.warn('[storage] refused to sign an object in the private twin bucket via the generic signer');
  return true;
}


type ListApi = {
  storage: {
    from: (bucket: string) => {
      list: (
        dir: string,
        opts: { limit: number; search: string },
      ) => Promise<{ data: Array<{ name?: string | null }> | null; error: { message: string } | null }>;
    };
  };
};

/**
 * Does `bucket/path` exist? TRUE / FALSE only when storage actually answered; NULL when it could not be asked
 * (unconfigured, an error, a throw). Anything that decides money on this must treat null as "cannot tell":
 * "storage was down" is not "the object is absent".
 *
 * `search` is a pattern match on the name (`_` is a wildcard in it), so a hit is re-checked for the EXACT
 * name here — a near-miss name can never stand in for the object asked about.
 */
export async function storageObjectExists(
  bucket: string,
  path: string,
  sb: ListApi | null = client() as unknown as ListApi | null,
): Promise<boolean | null> {
  if (!sb) return null;
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash) : '';
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  if (!name) return null;
  try {
    const { data, error } = await sb.storage.from(bucket).list(dir, { limit: 100, search: name });
    if (error || !Array.isArray(data)) return null;
    return data.some((o) => o?.name === name);
  } catch {
    return null;
  }
}


/** Mint a 15-minute signed URL for a stored object. Null when unavailable (and always for the twin bucket). */
export async function createSignedAssetUrl(
  bucket: string,
  path: string,
  expiresSec: number = SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  if (refuseTwin(bucket)) return null;
  const sb = client();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expiresSec);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

/** Batch variant — signs many paths in one call set, preserving order. */
export async function createSignedAssetUrls(
  bucket: string,
  paths: string[],
  expiresSec: number = SIGNED_URL_TTL_SEC,
): Promise<Array<string | null>> {
  if (refuseTwin(bucket)) return paths.map(() => null);
  const sb = client();
  if (!sb) return paths.map(() => null);
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, expiresSec);
    if (error || !data) return paths.map(() => null);
    // createSignedUrls returns results in the same order as the input paths.
    return data.map(d => d.signedUrl ?? null);
  } catch {
    return paths.map(() => null);
  }
}

/**
 * Parse a Supabase Storage object URL into { bucket, path } when it points
 * at OUR storage; returns null for external (provider) URLs. Handles both
 * public (`/object/public/<bucket>/<path>`) and signed
 * (`/object/sign/<bucket>/<path>?token=…`) shapes.
 */
export function parseSupabaseObjectUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith('.supabase.co')) return null;
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/);
    if (!m || !m[1] || !m[2]) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

/** A Supabase Storage object URL, with what parseSupabaseObjectUrl drops: which project, and how it grants access. */
export interface StorageObjectRef {
  bucket: string;
  path: string;
  /** `sign` = /object/sign/… (needs a valid token); `public` = /object/public/… (works only on a public bucket). */
  access: 'sign' | 'public';
  token: string | null;
  /** Lower-cased hostname — compare with ownStorageHosts() before treating the object as ours. */
  host: string;
}

/** parseSupabaseObjectUrl plus the access shape, token and host. Null for anything that is not a storage object URL. */
export function describeSupabaseObjectUrl(url: string): StorageObjectRef | null {
  const ref = parseSupabaseObjectUrl(url);
  if (!ref) return null;
  try {
    const u = new URL(url);
    const access = /\/storage\/v1\/object\/sign\//.test(u.pathname) ? 'sign' : 'public';
    const token = u.searchParams.get('token');
    return { ...ref, access, token: token && token.trim() ? token : null, host: u.hostname.toLowerCase() };
  } catch {
    return null;
  }
}

/**
 * Hostnames of OUR Supabase project, from both env spellings the clients use (the service-role client prefers
 * SUPABASE_URL, the browser NEXT_PUBLIC_SUPABASE_URL). parseSupabaseObjectUrl accepts ANY `*.supabase.co` host, so
 * anything that signs with our service role must also check the URL names this project — another tenant's bucket
 * can be called `renders` too.
 */
export function ownStorageHosts(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const hosts = new Set<string>();
  for (const raw of [env.SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_URL]) {
    if (!raw) continue;
    try { hosts.add(new URL(raw).hostname.toLowerCase()); } catch { /* not a URL */ }
  }
  return hosts;
}

/**
 * The buckets that hold user-facing media the Library shows — the ONLY buckets a stored Library URL may be
 * re-signed in. Found by grepping every writer: `renders` (RENDER_BUCKET: films, montage, decks, 3D, longform),
 * `uploads` (UPLOAD_BUCKET: user uploads, music, edits, storyboards) and `studio` (lib/studio/outputs STUDIO_BUCKET —
 * spelled out here because that module imports this one). Never the twin bucket (biometrics), never `avatars`
 * (profile/live-avatar faces), never `job-artifacts`.
 */
export function libraryMediaBuckets(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const buckets = new Set(['renders', 'uploads', 'studio']);
  for (const b of [env.RENDER_BUCKET, env.UPLOAD_BUCKET]) if (b && b.trim()) buckets.add(b.trim());
  for (const b of [...buckets]) if (isTwinBucket(b)) buckets.delete(b);
  return buckets;
}

export type FileableUrlVerdict =
  /** One of our objects, proven readable through a currently valid signed URL — safe to re-sign later. */
  | { ok: true; kind: 'own-signed'; bucket: string; path: string }
  /** A public-bucket URL of ours: it never expires, so it is filed as-is and never re-signed. */
  | { ok: true; kind: 'own-public' }
  /** Anything else on the public internet (a provider's CDN, another Supabase tenant): filed as-is, never re-signed. */
  | { ok: true; kind: 'external' }
  | { ok: false; reason: 'invalid_url' | 'not_media_bucket' | 'unsigned' | 'not_readable' };

/**
 * May a caller file `url` into their Library?
 *
 * ⚠️ THE LIBRARY RE-SIGNS WHAT IT STORES WITH THE SERVICE ROLE. So a URL that names one of our objects is accepted
 * only when it already PROVES access: a signed URL whose token our storage still honours (probed with a one-byte
 * ranged GET to our own host — the token is bound to that exact bucket/path, so it cannot be re-pointed). A bare or
 * expired `/object/sign/…` path, or a guess at someone else's object, is refused. Our storage paths are not
 * user-prefixed (`captioned/<ts>-<rand>.mp4`), so "the path starts with your id" is not a rule that can be used.
 */
export async function verifyFileableUrl(
  url: string,
  opts: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; timeoutMs?: number; isPublicUrl: (u: string) => boolean },
): Promise<FileableUrlVerdict> {
  const env = opts.env ?? process.env;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { ok: false, reason: 'invalid_url' }; }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { ok: false, reason: 'invalid_url' };

  const ref = describeSupabaseObjectUrl(url);
  if (!ref || !ownStorageHosts(env).has(ref.host)) {
    return opts.isPublicUrl(url) ? { ok: true, kind: 'external' } : { ok: false, reason: 'invalid_url' };
  }
  if (ref.access === 'public') return { ok: true, kind: 'own-public' };
  if (!libraryMediaBuckets(env).has(ref.bucket)) return { ok: false, reason: 'not_media_bucket' };
  if (!ref.token || parsed.protocol !== 'https:') return { ok: false, reason: 'unsigned' };

  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
    });
    void res.body?.cancel().catch(() => undefined);
    if (res.status !== 200 && res.status !== 206) return { ok: false, reason: 'not_readable' };
  } catch {
    return { ok: false, reason: 'not_readable' };
  }
  return { ok: true, kind: 'own-signed', bucket: ref.bucket, path: ref.path };
}

/**
 * If `url` is one of OUR Supabase Storage objects, return a fresh 15-minute
 * signed URL for it; otherwise return the URL unchanged (external provider
 * links are already time-limited by their issuer). Guarantees no permanent
 * internal bucket URL escapes onto the wire.
 */
export async function reSignIfInternal(url: string, expiresSec: number = SIGNED_URL_TTL_SEC): Promise<string> {
  const ref = parseSupabaseObjectUrl(url);
  if (!ref) return url;
  const signed = await createSignedAssetUrl(ref.bucket, ref.path, expiresSec);
  return signed ?? url;
}

/**
 * Upload a base64 fragment + return its signed URL.
 *
 * `expiresSec` defaults to the 15-minute internal-fragment TTL, but callers
 * re-hosting a user-facing render (PHASE 51 §2 — LTX MP4 binaries) pass a
 * longer lifetime so the asset survives well past the render session.
 */
export async function uploadAndSign(
  bucket: string,
  path: string,
  base64: string,
  contentType: string,
  expiresSec: number = SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const sb = client();
  if (!sb) return null;
  // Self-provision a private bucket on first use (idempotent). Removes the manual "create the renders
  // bucket" step; see ensureBucket for why the result is now actually read.
  await ensureBucket(sb as unknown as BucketApi, bucket);
  try {
    const bytes = Buffer.from(base64.includes(',') ? base64.split(',')[1] ?? '' : base64, 'base64');
    const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType: storageContentType(contentType, path), upsert: true });
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[storage] upload to ${bucket}/${path} failed:`, error.message);
      return null;
    }
    return createSignedAssetUrl(bucket, path, expiresSec);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[storage] upload to ${bucket}/${path} threw:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Upload a raw Buffer (no base64 round-trip) + return its signed URL. Preferred for
 * LARGE assets like the 30s film master: `uploadAndSign` takes base64, so a caller
 * holding a Buffer must `.toString('base64')` it and we then `Buffer.from()` it back —
 * holding the video ~2× in memory, which can OOM/fail the upload on a big master (the
 * "master upload failed (Storage not configured)" report, which was actually an upload
 * error, not a missing client). This path streams the Buffer straight through and retries
 * once on a transient failure. Returns null only when Storage is truly unavailable or
 * both attempts fail.
 */
export async function uploadBufferAndSign(
  bucket: string,
  path: string,
  buffer: Buffer,
  contentType: string,
  expiresSec: number = SIGNED_URL_TTL_SEC,
): Promise<string | null> {
  const sb = client();
  if (!sb) return null;
  // Video masters are tens of MB (a 60s 1080×1920 cut ≈ 32MB); a bucket created
  // with a smaller cap rejects them with "exceeded the maximum allowed size" — the
  // break that let 30s masters (~16MB) deliver while 60s masters never could.
  // Create new buckets generous, and self-heal an existing too-small one below.
  const LARGE_FILE_LIMIT = '256MB';
  await ensureBucket(sb as unknown as BucketApi, bucket, LARGE_FILE_LIMIT);
  // The Supabase storage client takes no AbortSignal, so bound each attempt with
  // a race-timeout: a stalled upload (the master is tens of MB) must not pin the
  // serverless function until the platform hard-kills it at maxDuration — the
  // same hang class the assemble clip-downloads were hardened against. On trip we
  // fall through to the retry / null so the route's saga can compensate.
  const UPLOAD_TIMEOUT_MS = 90_000;
  const type = storageContentType(contentType, path);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await Promise.race([
        sb.storage.from(bucket).upload(path, buffer, { contentType: type, upsert: true }),
        new Promise<{ error: { message: string } }>((resolve) =>
          setTimeout(() => resolve({ error: { message: `upload timed out after ${UPLOAD_TIMEOUT_MS}ms` } }), UPLOAD_TIMEOUT_MS)),
      ]);
      if (!error) return createSignedAssetUrl(bucket, path, expiresSec);
      // eslint-disable-next-line no-console
      console.warn(`[storage] buffer upload to ${bucket}/${path} failed (attempt ${attempt + 1}/2):`, error.message);
      // SELF-HEAL the canonical 60s-master blocker: an existing bucket whose
      // fileSizeLimit predates large video masters rejects them for size. Raise
      // the cap once and let the next attempt retry. Fail-open: a perms error just
      // falls through to null and the saga compensates.
      // ⚠️ NEVER the user-upload bucket: its 50 MB cap is deliberate (lib/uploads/policy, migration 20261008c), and
      // raising it here would quietly undo that for every signed browser upload. Server renders belong in `renders`.
      if (/maximum allowed size|exceeded|too large|payload too large/i.test(error.message) && !isUserUploadBucket(bucket)) {
        try {
          await sb.storage.updateBucket(bucket, { public: false, fileSizeLimit: LARGE_FILE_LIMIT });
          // eslint-disable-next-line no-console
          console.warn(`[storage] raised ${bucket} fileSizeLimit → ${LARGE_FILE_LIMIT}, retrying`);
        } catch (ue) {
          // eslint-disable-next-line no-console
          console.warn(`[storage] could not raise ${bucket} fileSizeLimit:`, ue instanceof Error ? ue.message : ue);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[storage] buffer upload to ${bucket}/${path} threw (attempt ${attempt + 1}/2):`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
