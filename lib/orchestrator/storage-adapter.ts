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
    if (error) return null;
    return createSignedAssetUrl(bucket, path, expiresSec);
  } catch {
    return null;
  }
}
