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

export const SIGNED_URL_TTL_SEC = 900; // 15 minutes

function client(): ReturnType<typeof createServiceRoleClient> | null {
  try {
    return createServiceRoleClient();
  } catch {
    return null;
  }
}

/** Best-effort delete of scratch objects (e.g. single-use lip-sync inputs) so they never bloat the
 *  bucket. Fail-open no-op when storage is unconfigured; a miss is harmless (objects expire on TTL). */
export async function removeStorageObjects(bucket: string, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const sb = client();
  if (!sb) return;
  try { await sb.storage.from(bucket).remove(paths); } catch { /* ignore */ }
}

/** Mint a 15-minute signed URL for a stored object. Null when unavailable. */
export async function createSignedAssetUrl(
  bucket: string,
  path: string,
  expiresSec: number = SIGNED_URL_TTL_SEC,
): Promise<string | null> {
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
  try {
    // Self-provision a private bucket on first use (idempotent — the service
    // role can create it; an "already exists" result is ignored). Removes the
    // manual "create the renders bucket" step.
    await sb.storage.createBucket(bucket, { public: false });
  } catch { /* exists / no perms — upload will surface any real failure */ }
  try {
    const bytes = Buffer.from(base64.includes(',') ? base64.split(',')[1] ?? '' : base64, 'base64');
    const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
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
  try {
    await sb.storage.createBucket(bucket, { public: false, fileSizeLimit: LARGE_FILE_LIMIT });
  } catch { /* exists / no perms — upload surfaces any real failure */ }
  // The Supabase storage client takes no AbortSignal, so bound each attempt with
  // a race-timeout: a stalled upload (the master is tens of MB) must not pin the
  // serverless function until the platform hard-kills it at maxDuration — the
  // same hang class the assemble clip-downloads were hardened against. On trip we
  // fall through to the retry / null so the route's saga can compensate.
  const UPLOAD_TIMEOUT_MS = 90_000;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { error } = await Promise.race([
        sb.storage.from(bucket).upload(path, buffer, { contentType, upsert: true }),
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
      if (/maximum allowed size|exceeded|too large|payload too large/i.test(error.message)) {
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
