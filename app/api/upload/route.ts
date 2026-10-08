/**
 * POST /api/upload — turn a client file (data URL) into a signed https URL.
 *
 * The Lipsync Studio (Card C) and the Omni Studio (Card B) let the user pick a
 * local video / audio / image. Replicate (Wav2Lip) and the Gemini route need a
 * real fetchable URL, not a multi-MB data URI, so this uploads the bytes to a
 * private Supabase bucket and returns a short-lived signed URL.
 *
 * Auth-gated (only signed-in users upload), owner-scoped path, and held to the shared upload policy
 * (lib/uploads/policy): images, video and audio only (415 otherwise) and at most 50 MB (413). It used to
 * store any content type the client named. No secret ever leaves; the signed URL expires in an hour.
 *
 * Request:  { dataUrl: string (data:...;base64,...), contentType?: string }
 * Response: { url: string } | { error }
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { validateAdImageMeta, base64ByteLength } from '@/lib/ads/adInputValidation';
import { UPLOAD_MAX_BYTES, allowedUploadMime, uploadExtFor } from '@/lib/uploads/policy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = process.env.UPLOAD_BUCKET || 'uploads';

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  let body: { dataUrl?: unknown; contentType?: unknown; adImage?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  // STEP 2.1 — an ad-generator reference image is held to the STRICT marketing profile
  // (jpeg/png/webp, ≤10MB) SERVER-SIDE, independent of what the client claims.
  const isAdImage = body.adImage === true;

  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
  if (!dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'dataUrl (data:...;base64,...) required' }, { status: 400 });
  }
  const headMatch = dataUrl.match(/^data:([^;,]+)[;,]/);
  const claimed = String(
    (typeof body.contentType === 'string' && body.contentType) || headMatch?.[1] || 'application/octet-stream',
  ).trim();
  const contentType = allowedUploadMime(claimed);
  if (!contentType) {
    return NextResponse.json({ error: 'unsupported file type (images, video and audio only)' }, { status: 415 });
  }

  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
  if (!b64) return NextResponse.json({ error: 'empty payload' }, { status: 400 });
  if (base64ByteLength(b64) > UPLOAD_MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (50MB max)' }, { status: 413 });
  }
  // STEP 2.1 — server-authoritative ad-image guard (mime allowlist + 10MB), never
  // trusting the client. Rejects with 415/413 before touching storage.
  if (isAdImage) {
    const v = validateAdImageMeta({ contentType, sizeBytes: base64ByteLength(b64) });
    if (!v.ok) {
      const status = /too large/i.test(v.error) ? 413 : 415;
      return NextResponse.json({ error: v.error }, { status });
    }
  }

  // Owner-scoped, collision-resistant path → a private bucket; an hour-long URL.
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${uploadExtFor(contentType)}`;
  const url = await uploadAndSign(BUCKET, path, b64, contentType, 3600);
  if (!url) {
    return NextResponse.json({ error: 'upload failed (storage not configured)' }, { status: 502 });
  }
  return NextResponse.json({ url });
}
