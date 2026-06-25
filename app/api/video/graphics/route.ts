/**
 * POST /api/video/graphics — the Music-Video GRAPHICS AGENT.
 * Body: { videoUrl, title?, subtitle?, lang?, musicBug?, introSec?, dialogue? } → { url }.
 * Layers a music-synced equalizer + animated title card + animated lower-third +
 * burned reference-style DIALOGUE SUBTITLES over the master. STRICTLY fail-open: any
 * miss returns the ORIGINAL videoUrl unchanged, so graphics can never break a render.
 */
import { NextRequest, NextResponse } from 'next/server';
import { enhanceMusicVideoGraphics } from '@/lib/pipeline/compositing/musicVideoGraphics';
import type { MusicBug } from '@/lib/pipeline/compositing/ffmpeg-overlay';

export const runtime = 'nodejs';
export const maxDuration = 300; // CPU ffmpeg overlay pass over a 60s master

export async function POST(req: NextRequest) {
  let body: { videoUrl?: unknown; title?: unknown; subtitle?: unknown; lang?: unknown; musicBug?: unknown; introSec?: unknown; dialogue?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl : '';
  if (!/^https?:\/\//i.test(videoUrl)) return NextResponse.json({ url: null });
  const lang = body.lang === 'ka' || body.lang === 'en' || body.lang === 'ru' ? body.lang : undefined;
  const out = await enhanceMusicVideoGraphics(videoUrl, {
    title: typeof body.title === 'string' ? body.title : undefined,
    subtitle: typeof body.subtitle === 'string' ? body.subtitle : undefined,
    lang,
    musicBug: (body.musicBug && typeof body.musicBug === 'object') ? (body.musicBug as MusicBug) : null,
    introSec: Number.isFinite(Number(body.introSec)) ? Number(body.introSec) : undefined,
    dialogue: typeof body.dialogue === 'string' ? body.dialogue : undefined,
  }).catch(() => null);
  // Fail-open: hand back the original master if graphics couldn't be applied.
  return NextResponse.json({ url: out ?? videoUrl, enhanced: !!out });
}
