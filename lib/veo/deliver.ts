/**
 * lib/veo/deliver.ts — hand a finished Vertex (GCS) clip to the rest of the product.
 *
 * Vertex writes Veo's output into OUR bucket, and a V4 signed URL is the way to read it — but a V4 signature lasts at
 * most 7 days, and the Library can re-sign only Supabase Storage objects. A GCS link saved straight into a user's
 * Library therefore dies a week later. So a Vertex clip is copied once into the same Supabase bucket every other clip
 * lives in; if that copy fails, the 7-day GCS link is still better than nothing and is returned instead.
 */
import 'server-only';
import { deliverableUrl } from './engine';
import { createSignedAssetUrl, uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import type { VeoVideo } from './types';

const DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_CLIP_BYTES = 256 * 1024 * 1024;
const WEEK_SEC = 604_800;

async function readCapped(res: Response): Promise<Buffer | null> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_CLIP_BYTES) return null;
  const reader = res.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CLIP_BYTES) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * A 7-day playable URL for a Vertex `gcs` clip, hosted in Supabase at `path` (bucket `renders`). Idempotent: an object
 * already at `path` is re-signed, never re-copied. Null only when the clip cannot be read at all. Never throws.
 */
export async function hostGcsVideo(video: Extract<VeoVideo, { kind: 'gcs' }>, path: string): Promise<string | null> {
  const existing = await createSignedAssetUrl('renders', path, WEEK_SEC);
  if (existing) return existing;
  let signed: string | null;
  try {
    signed = await deliverableUrl(video, WEEK_SEC);
  } catch {
    return null;
  }
  if (!signed) return null;
  try {
    const res = await fetch(signed, { cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
    const buf = res.ok ? await readCapped(res) : null;
    if (buf && buf.byteLength >= 1_024) {
      const hosted = await uploadBufferAndSign('renders', path, buf, video.mimeType || 'video/mp4', WEEK_SEC);
      if (hosted) return hosted;
    }
  } catch {
    /* the 7-day GCS link below still plays */
  }
  return signed;
}
