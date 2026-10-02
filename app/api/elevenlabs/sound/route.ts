import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { providerErrorBody } from '@/lib/api/providerError';

export const dynamic = 'force-dynamic';

/**
 * POST /api/elevenlabs/sound — a sound effect (ElevenLabs sound-generation, ≤22 s) → { success, audio (base64 mp3) }.
 *
 * ⚠️ THIS WAS AN ANONYMOUS ELEVENLABS PROXY. It sat on the api-security allowlist as a "grandfathered gap": rate-limited
 * per IP, no session, so anyone could loop paid SFX on the platform key — and a failure answered with the provider's
 * raw status body ("ElevenLabs Sound 401: {…}") and the name of the env var it needed. Now: per-IP burst guard →
 * verified session (mustSignInToGenerate) → per-ACCOUNT daily cap; failures go through lib/api/providerError.
 */
export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rl) return rl;

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null; // an auth outage reads as "no session", never as a user
  }
  if (mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(), { status: 401 });
  if (userId) {
    const capped = await checkRateLimitByKey(userId, RATE_LIMITS.AUDIO_GEN_USER);
    if (capped) return capped;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    const safe = providerErrorBody(new Error('not configured'));
    return NextResponse.json({ success: false, error: safe.error, message: safe.message }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { prompt?: string; duration?: number };
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  const duration = Math.min(Number(body.duration) > 0 ? Number(body.duration) : 22, 22);

  const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: prompt.slice(0, 450),
      duration_seconds: duration,
      prompt_influence: 0.3,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    // The provider's body stays in the server log only — never in the response.
    const detail = await res.text().catch(() => '');
    console.error('[elevenlabs/sound] provider failed:', res.status, detail.slice(0, 200));
    const safe = providerErrorBody({ status: res.status, message: detail });
    return NextResponse.json({ success: false, error: safe.error, message: safe.message }, { status: safe.status });
  }

  const audioBuffer = await res.arrayBuffer();
  const audio = Buffer.from(audioBuffer).toString('base64');
  return NextResponse.json({ success: true, audio });
}
