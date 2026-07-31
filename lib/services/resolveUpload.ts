import 'server-only';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';

/**
 * Turn a client media reference into something a provider can actually fetch.
 *
 * ⚠️ WHY EVERY v2 SERVICE NEEDS THIS. The browser uploads big files STRAIGHT to storage through a
 * signed upload URL — it has to, because a serverless request body caps out around 4.5MB and a real
 * video is 10–40MB. What comes back from that upload is a storage PATH, not a URL, and it cannot be a
 * URL: an object has to exist before it can be signed for reading.
 *
 * So a route that validates `^https?://` rejects the only thing the upload flow can give it, and the
 * service ends up demanding a public link the user does not have — which is exactly why Dubbing and 3D
 * asked for a URL instead of a file. This resolves the path at the moment the pipeline needs to fetch
 * it, which is the first point where signing is even possible.
 *
 * SECURITY. A bare path can only ever name an object inside our OWN upload bucket, so this widens the
 * input surface without widening the SSRF surface — it cannot be pointed at an arbitrary host. Anything
 * already carrying a scheme (`https:`, `data:`, `file:`, …) is returned untouched, so the caller's own
 * `isPublicHttpUrl` check still runs against it and still rejects what it always rejected.
 */
export async function resolveUploadRef(value: unknown, expiresSec = 3600): Promise<string> {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s) return '';
  // Has a scheme → not one of our paths. Hand it back for the caller's own validation.
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s;
  const signed = await createSignedAssetUrl(UPLOAD_BUCKET, s, expiresSec).catch(() => null);
  // Signing failed (deleted object, storage down) → return the original so the caller's validator
  // produces its normal "that is not a usable URL" error rather than a confusing empty-string one.
  return signed ?? s;
}
