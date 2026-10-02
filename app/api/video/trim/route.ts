/**
 * POST /api/video/trim — Stage 2b. Cut a window out of a clip (ffmpeg-static).
 * Body: { videoUrl, startSec, durationSec } → { url } (hosted segment) or { url: null }.
 * Used to slice the 30s HeyGen performance into per-scene segments for compositing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { trimClip } from '@/lib/video/trimClip';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  // ⚠️ THIS WAS OPEN TO ANYONE: no session, no limit. Each call downloads the given URL server-side, runs ffmpeg and
  // uploads the result to OUR storage — free compute + storage for the internet, and a server-side fetch of ANY address
  // (SSRF: localhost, the cloud metadata IP, private ranges). Its only caller is the signed-in studio's lip-sync
  // composite (credentials: 'include'), so: per-IP burst guard (its own bucket — one film trims up to 12 scenes) →
  // verified session → a public http(s) URL only. Every refusal keeps the fail-open `{ url: null }` contract's spirit:
  // the caller then keeps the original clip.
  const limited = await checkRateLimit(req, RATE_LIMITS.STORYBOARD, 'video-trim');
  if (limited) return limited;
  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (mustSignInToGenerate(userId)) return NextResponse.json({ url: null, ...signInToGenerateBody() }, { status: 401 });

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
  if (!isPublicHttpUrl(videoUrl)) return NextResponse.json({ url: null, error: 'invalid_url' }, { status: 400 });
  const url = await trimClip(videoUrl, startSec, durationSec).catch(() => null);
  return NextResponse.json({ url });
}
