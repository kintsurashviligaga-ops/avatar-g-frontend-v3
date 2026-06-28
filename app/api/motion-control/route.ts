/**
 * POST /api/motion-control — animate a character photo with Kling (Replicate).
 * Body: { characterImageUrl (data-url or https), referenceVideoUrl?, motionPrompt,
 *         duration?, aspectRatio? }. With a reference video it requests V2V (which
 *         currently degrades to motion-prompt I2V — Replicate has no true V2V Kling).
 * Returns { success, videoUrl, method, logs }. The Replicate output is re-hosted to a
 * 7-day signed Supabase URL (fail-open to the raw Replicate URL).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { klingImageToVideo, klingVideoToVideo, klingConfigured } from '@/lib/ai/klingClient';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!klingConfigured()) return NextResponse.json({ error: 'video engine not configured' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    characterImageUrl?: string; referenceVideoUrl?: string; motionPrompt?: string;
    duration?: number; aspectRatio?: string;
  } | null;
  const characterImageUrl = body?.characterImageUrl?.trim();
  const motionPrompt = body?.motionPrompt?.trim();
  if (!characterImageUrl || !motionPrompt) {
    return NextResponse.json({ error: 'characterImageUrl + motionPrompt required' }, { status: 400 });
  }
  const duration: 5 | 10 = body?.duration === 10 ? 10 : 5;
  const aspectRatio = (['9:16', '16:9', '1:1'].includes(String(body?.aspectRatio)) ? body!.aspectRatio : '9:16') as '9:16' | '16:9' | '1:1';

  const logs: string[] = [];
  const log = (m: string) => { logs.push(m); };

  try {
    let videoUrl: string;
    let method: 'v2v' | 'i2v';
    if (body?.referenceVideoUrl?.trim()) {
      method = 'v2v';
      videoUrl = await klingVideoToVideo({
        imageUrl: characterImageUrl, videoUrl: body.referenceVideoUrl.trim(),
        prompt: motionPrompt, duration, aspectRatio, onProgress: log,
      });
    } else {
      method = 'i2v';
      videoUrl = await klingImageToVideo({
        imageUrl: characterImageUrl, prompt: motionPrompt, duration, aspectRatio, onProgress: log,
      });
    }

    // Re-host the Replicate output (expires in ~24h) to a durable 7-day signed URL.
    let finalUrl = videoUrl;
    try {
      const res = await fetch(videoUrl);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const path = `motion-control/${user.id}/${Date.now()}.mp4`;
        const signed = await uploadBufferAndSign('renders', path, buf, 'video/mp4', 604_800);
        if (signed) finalUrl = signed;
      }
    } catch { /* keep the Replicate URL */ }

    return NextResponse.json({ success: true, videoUrl: finalUrl, method, logs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, logs }, { status: 500 });
  }
}
