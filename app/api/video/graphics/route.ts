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
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';

export const runtime = 'nodejs';
export const maxDuration = 300; // CPU ffmpeg overlay pass over a 60s master

export async function POST(req: NextRequest) {
  // ⚠️ THIS WAS OPEN TO ANYONE: up to 300 s of ffmpeg per call over a URL the caller chooses, the result uploaded to OUR
  // storage — and ffmpeg fetches that URL server-side (SSRF). The only caller is the signed-in studio's music-video
  // finish (credentials: 'include'): per-IP burst guard → verified session → a public http(s) URL only.
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE, 'video-graphics');
  if (limited) return limited;
  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (mustSignInToGenerate(userId)) return NextResponse.json({ url: null, ...signInToGenerateBody() }, { status: 401 });

  let body: { videoUrl?: unknown; title?: unknown; subtitle?: unknown; lang?: unknown; musicBug?: unknown; introSec?: unknown; dialogue?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const videoUrl = typeof body.videoUrl === 'string' ? body.videoUrl : '';
  if (!/^https?:\/\//i.test(videoUrl)) return NextResponse.json({ url: null });
  if (!isPublicHttpUrl(videoUrl)) return NextResponse.json({ url: null, error: 'invalid_url' }, { status: 400 });
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
