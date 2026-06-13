import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * POST /api/upload/sign — issue a signed UPLOAD URL so the browser can PUT a large
 * file (audio / video / big image) DIRECTLY to Supabase, BYPASSING Vercel's ~4.5MB
 * function-body limit. (The data-URL-in-JSON path caps out around 3MB — a real song
 * returns "FUNCTION_PAYLOAD_TOO_LARGE".) Returns the upload token + a readable signed
 * URL for the same path (valid once the upload lands), which downstream providers
 * (Replicate MusicGen melody, etc.) can fetch.
 *
 * Tiny request/response — no file bytes pass through this function.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 20;

const BUCKET = process.env.UPLOAD_BUCKET || 'uploads';

function extFor(ct: string): string {
  const c = ct.toLowerCase();
  if (c.includes('mp4')) return 'mp4';
  if (c.includes('webm')) return 'webm';
  if (c.includes('quicktime') || c.includes('mov')) return 'mov';
  if (c.includes('mpeg') || c.includes('mp3')) return 'mp3';
  if (c.includes('wav')) return 'wav';
  if (c.includes('ogg')) return 'ogg';
  if (c.includes('aac') || c.includes('m4a')) return 'm4a';
  if (c.includes('png')) return 'png';
  if (c.includes('webp')) return 'webp';
  if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
  return 'bin';
}

export async function POST(req: NextRequest) {
  let contentType = 'application/octet-stream';
  try {
    const body = (await req.json().catch(() => ({}))) as { contentType?: unknown };
    if (typeof body.contentType === 'string' && body.contentType.trim()) contentType = body.contentType.trim();
  } catch {
    /* defaults */
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'storage not configured' }, { status: 502 });
  }

  const path = `omni-uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extFor(contentType)}`;
  const { data: up, error: upErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (upErr || !up) {
    return NextResponse.json({ error: upErr?.message || 'could not create upload url' }, { status: 502 });
  }
  // The readable URL is signed by the consumer AFTER the upload lands (an object must
  // exist before it can be signed), so we return just the upload handle + its path.
  return NextResponse.json({
    bucket: BUCKET,
    path,
    token: up.token,
    signedUrl: up.signedUrl,
  });
}
