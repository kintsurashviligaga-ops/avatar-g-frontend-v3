/**
 * POST /api/audio/isolate — Stage 2 vocal isolation for the HeyGen singer lip-sync.
 * Body: { audioUrl }. Returns { vocalUrl } (the backing stripped via the ElevenLabs
 * Voice Isolator) or { vocalUrl: null } on any miss — the caller then falls back to
 * the full song mix, so the HeyGen pass always proceeds.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { isOwnSupabaseUrl } from '@/lib/security/allowlistedAudioFetch';
import { isolateVocal } from '@/lib/elevenlabs/audioIsolation';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  // WS2 — paid ElevenLabs Voice Isolator + a server-side fetch of the caller-supplied `audioUrl` (SSRF).
  // Was fully unauthenticated. The sole caller (OmniStudio) sends its session cookie, so require a user;
  // and only isolate audio WE host (own Supabase) so this can't be turned into an arbitrary-URL fetcher.
  try { await requireAuthenticatedUser(req); } catch { return NextResponse.json({ error: 'Unauthorized' }, { status: 401 }); }
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE); if (rl) return rl;

  let body: { audioUrl?: unknown };
  try {
    body = (await req.json()) as { audioUrl?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() : '';
  if (!audioUrl) return NextResponse.json({ vocalUrl: null });
  // SSRF guard: a non-own-Supabase URL yields null (the caller then falls back to the full song mix,
  // exactly as it does on any isolation miss) — never a fetch of an attacker-chosen host.
  if (!isOwnSupabaseUrl(audioUrl)) return NextResponse.json({ vocalUrl: null });
  const vocalUrl = await isolateVocal(audioUrl, req.signal).catch(() => null);
  return NextResponse.json({ vocalUrl });
}
