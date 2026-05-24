import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Real-time interactive avatar session (HeyGen LiveAvatar).
 *
 * Mints a LiveKit-backed streaming session so the client can talk to a live,
 * Georgian-speaking avatar. Two-step LiveAvatar flow:
 *   1. POST https://api.liveavatar.com/v1/sessions/token  (X-API-KEY)  → session_token
 *   2. POST https://api.liveavatar.com/v1/sessions/start  (Bearer token) → livekit creds
 *
 * GATED: requires LIVEAVATAR_API_KEY (a SEPARATE account from HeyGen — sign up at
 * liveavatar.com). Until that env var is set this returns 503 with clear guidance,
 * so the app degrades gracefully to the rendered avatar greeting.
 *
 * Config (env, with Eka Georgian defaults):
 *   LIVEAVATAR_API_KEY      – required
 *   LIVEAVATAR_AVATAR_ID    – interactive avatar id from the LiveAvatar account
 *   LIVEAVATAR_VOICE_ID     – Georgian voice id (Eka-Natural by default)
 *   LIVEAVATAR_LANGUAGE     – defaults to 'ka'
 *   LIVEAVATAR_QUALITY      – very_high | high | medium | low (default high)
 */

const LIVE_BASE = 'https://api.liveavatar.com';
const norm = (v: string | null | undefined) => String(v || '').trim();

interface TokenResp { code?: number; message?: string; data?: { session_id?: string; session_token?: string } }
interface StartResp { session_id?: string; livekit_url?: string; livekit_client_token?: string; max_session_duration?: number }

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = norm(process.env.LIVEAVATAR_API_KEY);
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: 'Real-time avatar not configured',
      detail: 'Set LIVEAVATAR_API_KEY in Vercel (separate signup at liveavatar.com). The HeyGen key does not grant LiveAvatar access.',
    }, { status: 503 });
  }

  const avatarId = norm(process.env.LIVEAVATAR_AVATAR_ID);
  if (!avatarId) {
    return NextResponse.json({ ok: false, configured: false, error: 'LIVEAVATAR_AVATAR_ID not set' }, { status: 503 });
  }
  const voiceId = norm(process.env.LIVEAVATAR_VOICE_ID) || '081f165a0d88432b991830e8deeac2e3'; // Eka - Natural (ka)
  const language = norm(process.env.LIVEAVATAR_LANGUAGE) || 'ka';
  const quality = norm(process.env.LIVEAVATAR_QUALITY) || 'high';

  // Optional client overrides (kept conservative).
  let overrides: { avatarId?: string } = {};
  try { overrides = (await req.json()) as { avatarId?: string }; } catch { /* no body */ }

  try {
    // 1) session token
    const tokenRes = await fetch(`${LIVE_BASE}/v1/sessions/token`, {
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        avatar_id: overrides.avatarId || avatarId,
        avatar_persona: { voice_id: voiceId, language },
        video_settings: { quality, encoding: 'H264' },
      }),
      cache: 'no-store',
    });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as TokenResp;
    const sessionToken = tokenJson.data?.session_token;
    if (!tokenRes.ok || !sessionToken) {
      return NextResponse.json({ ok: false, step: 'token', status: tokenRes.status, detail: tokenJson.message || 'token failed' }, { status: 502 });
    }

    // 2) start session → LiveKit creds
    const startRes = await fetch(`${LIVE_BASE}/v1/sessions/start`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sessionToken}`, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
    });
    const startJson = (await startRes.json().catch(() => ({}))) as StartResp;
    if (!startRes.ok || !startJson.livekit_url || !startJson.livekit_client_token) {
      return NextResponse.json({ ok: false, step: 'start', status: startRes.status, detail: 'start failed' }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      sessionId: startJson.session_id ?? tokenJson.data?.session_id,
      livekitUrl: startJson.livekit_url,
      livekitToken: startJson.livekit_client_token,
      maxDurationSec: startJson.max_session_duration ?? null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'session error' }, { status: 502 });
  }
}
