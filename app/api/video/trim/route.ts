/**
 * POST /api/video/trim — Stage 2b. Cut a window out of a clip (ffmpeg-static).
 * Body: { videoUrl, startSec, durationSec } → { url } (hosted segment) or { url: null }.
 * Used to slice the 30s HeyGen performance into per-scene segments for compositing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { trimClip } from '@/lib/video/trimClip';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { videoUrl?: unknown; startSec?: unknown; durationSec?: unknown };
  try {
    body = (await req.json()) as { videoUrl?: unknown; startSec?: unknown; durationSec?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl.trim() : '';
  const startSec = Number.isFinite(Number(body.startSec)) ? Number(body.startSec) : 0;
  const durationSec = Number.isFinite(Number(body.durationSec)) && Number(body.durationSec) > 0 ? Number(body.durationSec) : 5;
  if (!videoUrl) return NextResponse.json({ url: null });
  const url = await trimClip(videoUrl, startSec, durationSec).catch(() => null);
  return NextResponse.json({ url });
}
