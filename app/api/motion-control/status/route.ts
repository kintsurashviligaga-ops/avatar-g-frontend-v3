/**
 * GET /api/motion-control/status?id=<predictionId>&music=1&mood=energetic&duration=5
 *
 * Polls a Kling motion job (submitted by POST /api/motion-control) ONCE:
 *   • still rendering → { done: false }
 *   • failed         → { done: true, error }
 *   • succeeded       → finalize on THIS request (re-host the Replicate output to a
 *                       durable 7-day Supabase URL + optional MusicGen bed) →
 *                       { done: true, videoUrl, music }
 *
 * The client polls SEQUENTIALLY (awaits each response before the next), so the single
 * "succeeded" poll that runs finalization never overlaps another — no duplicate
 * re-host / music gen. Each poll is short, so the gateway never times out (the 504 fix).
 *
 * NOTE: the music mux uses ffmpeg-static (muxAudioOntoVideo) — this route is registered
 * in next.config.js → outputFileTracingIncludes so the binary ships in the lambda.
 */
import 'server-only';
import { NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { klingPoll } from '@/lib/ai/klingClient';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { generateMusic } from '@/lib/ai/replicate';
import { muxAudioOntoVideo } from '@/lib/video/remixOps';

// Mood → instrumental MusicGen prompt (no vocals, so the bed never fights the visuals).
const MOOD_PROMPTS: Record<string, string> = {
  energetic: 'upbeat energetic electronic music, driving beat, high energy, instrumental, no vocals',
  calm: 'peaceful ambient music, soft piano, relaxing atmosphere, instrumental, no vocals',
  romantic: 'romantic soft music, warm strings, emotional, instrumental, no vocals',
  epic: 'epic orchestral music, dramatic, cinematic, instrumental, no vocals',
  happy: 'happy uplifting pop music, bright and cheerful, instrumental, no vocals',
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // the finalizing poll re-hosts + (optionally) muxes music

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const poll = await klingPoll(id);
  if (poll.status === 'processing') return NextResponse.json({ done: false });
  if (poll.status === 'failed' || !poll.url) {
    return NextResponse.json({ done: true, error: poll.error || 'motion generation failed' });
  }

  // ─── Succeeded → finalize (this is the single finalizing poll) ───────────────
  const t0 = Date.now();
  let finalUrl = poll.url;

  // Re-host the Replicate output (expires ~24h) to a durable 7-day signed URL.
  try {
    const res = await fetch(poll.url);
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      const path = `motion-control/${user.id}/${Date.now()}.mp4`;
      const signed = await uploadBufferAndSign('renders', path, buf, 'video/mp4', 604_800);
      if (signed) finalUrl = signed;
    }
  } catch { /* keep the Replicate URL */ }

  // Optional instrumental background music, muxed onto the silent clip (mode 'replace').
  // Bounded by the route's remaining time budget; fail-open → silent clip.
  let music = false;
  if (searchParams.get('music') === '1') {
    const mood = MOOD_PROMPTS[String(searchParams.get('mood'))] ? String(searchParams.get('mood')) : 'energetic';
    const duration = Number(searchParams.get('duration')) === 10 ? 10 : 5;
    const remainingMs = 300_000 - (Date.now() - t0) - 25_000; // keep 25s response headroom
    if (remainingMs > 40_000) {
      try {
        const gen = await Promise.race([
          generateMusic(MOOD_PROMPTS[mood]!, Math.max(8, duration + 3)),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('music gen timed out')), Math.min(45_000, remainingMs - 10_000))),
        ]);
        if (gen.audioUrl) {
          const mixed = await muxAudioOntoVideo(finalUrl, gen.audioUrl, 'replace').catch(() => null);
          if (mixed) { finalUrl = mixed; music = true; }
        }
      } catch { /* fail-open — return the silent clip */ }
    }
  }

  return NextResponse.json({ done: true, videoUrl: finalUrl, music });
}
