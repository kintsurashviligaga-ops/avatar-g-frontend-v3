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
import { generateMusic } from '@/lib/ai/replicate';
import { muxAudioOntoVideo } from '@/lib/video/remixOps';

// Mood → MusicGen prompt for the optional background-music pass. All instrumental
// (no vocals) so the bed never fights an on-screen performance.
const MOOD_PROMPTS: Record<string, string> = {
  energetic: 'upbeat energetic electronic music, driving beat, high energy, instrumental, no vocals',
  calm: 'peaceful ambient music, soft piano, relaxing atmosphere, instrumental, no vocals',
  romantic: 'romantic soft music, warm strings, emotional, instrumental, no vocals',
  epic: 'epic orchestral music, dramatic, cinematic, instrumental, no vocals',
  happy: 'happy uplifting pop music, bright and cheerful, instrumental, no vocals',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: Request) {
  const t0 = Date.now(); // route clock — the optional music pass is bounded by the time left
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!klingConfigured()) return NextResponse.json({ error: 'video engine not configured' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as {
    characterImageUrl?: string; referenceVideoUrl?: string; motionPrompt?: string;
    duration?: number; aspectRatio?: string; enableMusic?: boolean; musicMood?: string;
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

    // OPTIONAL background music — generate an instrumental MusicGen bed for the chosen
    // mood and mux it onto the clip (ffmpeg-static via muxAudioOntoVideo, mode 'replace'
    // since the Kling clip is silent). (Skipped by the client when lip-sync is on — the
    // talking voice owns the audio there.)
    //
    // CRITICAL: the WHOLE music step is bounded by the route's REMAINING time budget so
    // the request ALWAYS returns before maxDuration (300s) — even if Kling ran long or
    // the ffmpeg mux stalls. If the deadline fires we simply return the silent clip (the
    // orphaned mux is abandoned, never blocking the response). Fail-open at every step.
    let music = false;
    if (body?.enableMusic === true) {
      const remainingMs = 300_000 - (Date.now() - t0) - 25_000; // keep 25s response headroom
      if (remainingMs > 40_000) {
        const mood = MOOD_PROMPTS[String(body?.musicMood)] ? String(body!.musicMood) : 'energetic';
        log(`🎵 ${mood} background music…`);
        await Promise.race([
          (async () => {
            try {
              const gen = await Promise.race([
                generateMusic(MOOD_PROMPTS[mood]!, Math.max(8, duration + 3)),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('music gen timed out')), Math.min(45_000, remainingMs - 10_000))),
              ]);
              if (gen.audioUrl) {
                const mixed = await muxAudioOntoVideo(finalUrl, gen.audioUrl, 'replace').catch(() => null);
                if (mixed) { finalUrl = mixed; music = true; log('✅ music added'); }
              }
            } catch (e) { log(`⚠️ music skipped: ${e instanceof Error ? e.message : String(e)}`); }
          })(),
          // Hard ceiling on the whole step — guarantees the route returns in time.
          new Promise<void>((resolve) => setTimeout(resolve, remainingMs)),
        ]).catch(() => {});
      } else {
        log('🎵 music skipped — not enough route time left');
      }
    }

    return NextResponse.json({ success: true, videoUrl: finalUrl, method, music, logs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, logs }, { status: 500 });
  }
}
