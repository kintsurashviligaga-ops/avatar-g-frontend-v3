/**
 * POST /api/upload — turn a client file (data URL) into a signed https URL.
 *
 * The Lipsync Studio (Card C) and the Omni Studio (Card B) let the user pick a
 * local video / audio / image. Replicate (Wav2Lip) and the Gemini route need a
 * real fetchable URL, not a multi-MB data URI, so this uploads the bytes to a
 * private Supabase bucket and returns a short-lived signed URL.
 *
 * Auth-gated (only signed-in users upload), size-capped, owner-scoped path. No
 * secret ever leaves; the signed URL expires in an hour.
 *
 * Request:  { dataUrl: string (data:...;base64,...), contentType?: string }
 * Response: { url: string } | { error }
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
const MAX_BYTES = 60 * 1024 * 1024; // 60 MB — comfortably covers a short avatar clip

function extFor(ct: string): string {
  const c = ct.toLowerCase();
  if (c.includes('mp4')) return 'mp4';
  if (c.includes('webm')) return 'webm';
  if (c.includes('quicktime') || c.includes('mov')) return 'mov';
  if (c.includes('mpeg') || c.includes('mp3')) return 'mp3';
  if (c.includes('wav')) return 'wav';
  if (c.includes('aac') || c.includes('m4a')) return 'm4a';
  if (c.includes('png')) return 'png';
  if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
  return 'bin';
}

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'auth required' }, { status: 401 });

  let body: { dataUrl?: unknown; contentType?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const dataUrl = typeof body.dataUrl === 'string' ? body.dataUrl : '';
  if (!dataUrl.startsWith('data:')) {
    return NextResponse.json({ error: 'dataUrl (data:...;base64,...) required' }, { status: 400 });
  }
  const headMatch = dataUrl.match(/^data:([^;,]+)[;,]/);
  const contentType = String(
    (typeof body.contentType === 'string' && body.contentType) || headMatch?.[1] || 'application/octet-stream',
  ).trim();

  const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
  if (!b64) return NextResponse.json({ error: 'empty payload' }, { status: 400 });
  if (b64.length * 0.75 > MAX_BYTES) {
    return NextResponse.json({ error: 'file too large (60MB max)' }, { status: 413 });
  }

  // Owner-scoped, collision-resistant path → a private bucket; an hour-long URL.
  const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extFor(contentType)}`;
  const url = await uploadAndSign(BUCKET, path, b64, contentType, 3600);
  if (!url) {
    return NextResponse.json({ error: 'upload failed (storage not configured)' }, { status: 502 });
  }
  return NextResponse.json({ url });
}
