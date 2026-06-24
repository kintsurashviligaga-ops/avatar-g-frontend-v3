/**
 * POST /api/audio/georgian-song — build a real GEORGIAN-vocal song for a music video.
 * Body: { brief, gender?, totalSec? } → { url } (Georgian rap/hook on the cloned KA
 * voice, mixed over a funk instrumental) or { url: null } on any miss (caller then
 * falls back to the normal ElevenLabs Music path).
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateGeorgianSong, diagnoseGeorgianSong } from '@/lib/audio/georgianSong';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function POST(req: NextRequest) {
  // Cost/abuse guard: this is a public POST and each accepted call performs billed
  // ElevenLabs TTS + Music (or Replicate) work before any fail-open, so cap it per-IP
  // at the EXPENSIVE tier (5/min). A 429 is returned as a normal response, never a 500.
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE });
  if (gate.response) return gate.response;

  let body: { brief?: unknown; gender?: unknown; totalSec?: unknown; diag?: unknown };
  try {
    body = (await req.json()) as { brief?: unknown; gender?: unknown; totalSec?: unknown; diag?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
  const gender: 'male' | 'female' = body.gender === 'male' ? 'male' : 'female';
  const totalSec = Number.isFinite(Number(body.totalSec)) && Number(body.totalSec) > 0 ? Math.min(60, Number(body.totalSec)) : 30;
  if (!brief) return NextResponse.json({ url: null });
  // Diagnostic mode (gated): run each leg in isolation and report which fails + why,
  // so a prod miss can be localized (the main path fail-opens to null and hides it).
  if (body.diag === true) {
    const diag = await diagnoseGeorgianSong(brief, gender, totalSec, req.signal).catch((e) => ({ error: String(e) }));
    return NextResponse.json({ diag });
  }
  // EL Music is intermittently flaky (~1-in-2 misses observed on prod), and a single
  // null silently drops the Georgian vocal to the English fallback. The legs are healthy,
  // so retry the whole build a few times before giving up — the 240s budget covers ~3
  // attempts (~32s each on success). Still strictly fail-open: null after all retries.
  let url: string | null = null;
  for (let attempt = 0; attempt < 3 && !url; attempt += 1) {
    if (req.signal?.aborted) break;
    url = await generateGeorgianSong(brief, gender, totalSec, req.signal).catch(() => null);
  }
  return NextResponse.json({ url });
}
