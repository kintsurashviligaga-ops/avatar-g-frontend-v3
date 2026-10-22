/**
 * POST /api/audio/georgian-song — build a real GEORGIAN-vocal song for a music video.
 * Body: { brief, gender?, totalSec?, sceneSec? } → { url } (Georgian lyrics written from the brief on the cloned KA
 * voice, mixed over an instrumental in the brief's genre) or { url: null } on any miss (caller then
 * falls back to the normal score path at /api/video/assemble, Lyria 3).
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateGeorgianSong, diagnoseGeorgianSong } from '@/lib/audio/georgianSong';
import { filmSongSeconds } from '@/lib/audio/songPrompt';
import { applyApiGuards } from '@/lib/api/guard';
import { checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { isAdmin } from '@/lib/auth/adminGuard';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function POST(req: NextRequest) {
  // Burst guard first: each accepted call performs billed ElevenLabs TTS + Music (or Replicate) work before any
  // fail-open, so cap it per-IP at the EXPENSIVE tier (5/min). A 429 is returned as a normal response, never a 500.
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE });
  if (gate.response) return gate.response;

  // ⚠️ SIGNED-IN ONLY. Every accepted call is billed Cloud TTS + Lyria work (up to three full attempts), and it
  // used to answer ANYONE — the per-IP cap above bounds a minute, not a day, and rotating IPs bound nothing. The only
  // caller is the studio's music-video render, which already requires an account; a 401 here just means its fail-open
  // `url: null` → the normal score path, exactly as on any other miss.
  let userId: string | null = gate.auth?.userId ?? null;
  if (!userId) {
    try {
      userId = (await authedClientFromRequest(req)).user?.id ?? null;
    } catch {
      userId = null;
    }
  }
  if (mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(), { status: 401 });
  if (userId) {
    const capped = await checkRateLimitByKey(userId, RATE_LIMITS.AUDIO_GEN_USER);
    if (capped) return capped;
  }

  let body: { brief?: unknown; gender?: unknown; totalSec?: unknown; sceneSec?: unknown; diag?: unknown };
  try {
    body = (await req.json()) as { brief?: unknown; gender?: unknown; totalSec?: unknown; sceneSec?: unknown; diag?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
  const gender: 'male' | 'female' = body.gender === 'male' ? 'male' : 'female';
  // The song runs under the whole film (it was capped at 60 s, so a longer music video lost its song at the end).
  const totalSec = Number.isFinite(Number(body.totalSec)) && Number(body.totalSec) > 0 ? filmSongSeconds(Number(body.totalSec)) : 30;
  // One scene's length, so the bed's tempo puts every cut on a bar line (lib/audio/songPrompt sceneAlignedBpm).
  const sceneSec = Number.isFinite(Number(body.sceneSec)) && Number(body.sceneSec) >= 4 && Number(body.sceneSec) <= 8 ? Number(body.sceneSec) : undefined;
  if (!brief) return NextResponse.json({ url: null });
  // Diagnostic mode (gated): run each leg in isolation and report which fails + why,
  // so a prod miss can be localized (the main path fail-opens to null and hides it).
  // ⚠️ ADMIN ONLY: the diagnostic returns each leg's raw failure text (provider names, status bodies) — operator data.
  if (body.diag === true) {
    if (!(await isAdmin().catch(() => false))) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const diag = await diagnoseGeorgianSong(brief, gender, totalSec, req.signal).catch((e) => ({ error: String(e) }));
    return NextResponse.json({ diag });
  }
  // The music leg was intermittently flaky (~1-in-2 misses observed on prod with ElevenLabs Music), and a single
  // null silently drops the Georgian vocal to the English fallback. The legs are healthy,
  // so retry the whole build a few times before giving up — the 240s budget covers ~3
  // attempts (~32s each on success). Still strictly fail-open: null after all retries.
  // A longer song takes longer, so a retry starts only while one more full attempt still fits the function's budget: one the
  // platform kills half-way has already paid for its voice and music and returns nothing.
  const startedAt = Date.now();
  let lastAttemptMs = 0;
  let url: string | null = null;
  for (let attempt = 0; attempt < 3 && !url; attempt += 1) {
    if (req.signal?.aborted) break;
    if (attempt > 0 && Date.now() - startedAt + lastAttemptMs > (maxDuration - 15) * 1000) break;
    const t0 = Date.now();
    url = await generateGeorgianSong(brief, gender, totalSec, req.signal, sceneSec ? { sceneSec } : {}).catch(() => null);
    lastAttemptMs = Date.now() - t0;
  }
  return NextResponse.json({ url });
}
