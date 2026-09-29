/**
 * Copy a provider's finished media into OUR storage (brief D6): Higgsfield keeps outputs ≥ 7 days, so the
 * moment a job finishes every file is downloaded and re-hosted, and a user is only ever handed our URL.
 *
 * Private bucket `studio` (created on first upload by uploadBufferAndSign), signed on read — a generation is
 * the user's own until they share it. The download is SSRF-guarded and byte-capped DURING the read, even
 * though the URLs come from an authenticated webhook / status poll: a URL is still data from outside.
 */
import 'server-only';
import { isPublicHttpUrl, readBodyWithCap } from '@/lib/security/allowlistedAudioFetch';
import { createSignedAssetUrl, uploadBufferAndSign, SIGNED_URL_TTL_SEC } from '@/lib/orchestrator/storage-adapter';
import type { StoredOutput, StudioJob } from '@/lib/studio/store';

export const STUDIO_BUCKET = 'studio';
const MAX_OUTPUT_BYTES = 250 * 1024 * 1024; // the storage-adapter bucket cap is 256 MB
const DOWNLOAD_TIMEOUT_MS = 120_000;

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
};

function extFor(contentType: string, url: string): string {
  const fromType = EXT[contentType.split(';')[0]?.trim().toLowerCase() ?? ''];
  if (fromType) return fromType;
  const m = new URL(url).pathname.match(/\.([a-z0-9]{2,5})$/i);
  return m?.[1]?.toLowerCase() ?? 'bin';
}

/** All outputs or nothing: a partial copy is retried whole by the next finalize, never shown half-done. */
export async function copyOutputsToStorage(job: StudioJob, urls: string[]): Promise<StoredOutput[] | null> {
  if (urls.length === 0) return null;
  const stored: StoredOutput[] = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;
    if (!url.startsWith('https://') || !isPublicHttpUrl(url)) return null;
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), redirect: 'error', cache: 'no-store' });
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const buf = await readBodyWithCap(res, MAX_OUTPUT_BYTES);
    if (!buf || buf.byteLength === 0) return null;
    const contentType = (res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0]!.trim();
    const path = `${job.user_id}/${job.id}/${i}.${extFor(contentType, url)}`;
    const signed = await uploadBufferAndSign(STUDIO_BUCKET, path, buf, contentType);
    if (!signed) return null;
    stored.push({ bucket: STUDIO_BUCKET, path, contentType });
  }
  return stored;
}

/** Fresh signed URLs for a job's outputs (15 min, like the rest of the platform). */
export async function signOutputs(outputs: StoredOutput[], ttlSec: number = SIGNED_URL_TTL_SEC): Promise<string[]> {
  const urls = await Promise.all(outputs.map((o) => createSignedAssetUrl(o.bucket, o.path, ttlSec).catch(() => null)));
  return urls.filter((u): u is string => typeof u === 'string' && u.length > 0);
}
