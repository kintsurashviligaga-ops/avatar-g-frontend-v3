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

/** Upload a base64 fragment + return its 15-minute signed URL. */
export async function uploadAndSign(
  bucket: string,
  path: string,
  base64: string,
  contentType: string,
): Promise<string | null> {
  const sb = client();
  if (!sb) return null;
  try {
    const bytes = Buffer.from(base64.includes(',') ? base64.split(',')[1] ?? '' : base64, 'base64');
    const { error } = await sb.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
    if (error) return null;
    return createSignedAssetUrl(bucket, path, SIGNED_URL_TTL_SEC);
  } catch {
    return null;
  }
}
