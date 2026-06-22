import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';

/**
 * /api/heygen/presenter — "Presenter mode"
 * ========================================
 * A consistent HeyGen avatar speaks a script in the user's CLONED GEORGIAN VOICE.
 * Unlike the avatar route (HeyGen's own TTS, which falls back to English for `ka`),
 * this synthesizes the line with our cloned eleven_v3 voice first, hosts it, and
 * drives the avatar with `voice.type:'audio'` so the lips track native Georgian.
 *
 * TWO-PHASE START + POLL (mobile-safe, never blocks past the gateway timeout):
 *   POST { text, gender?, orientation? }        → { success, phase:'synthesized', audioUrl }  (Phase A: TTS)
 *   POST { audioUrl, gender?, orientation? }    → { success, videoId, audioUrl }              (Phase B: HeyGen submit)
 *   GET  ?id=<videoId>                          → { done, url, error }                         (quick poll)
 *
 * WHY TWO PHASES: doing TTS-synth + avatar-lookup + HeyGen-submit in ONE request
 * summed past Vercel's 60s function limit → reproducible 504s. Splitting keeps each
 * request comfortably short; the client chains A→B→poll.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const HEYGEN_BASE = 'https://api.heygen.com';

/** fetch with a hard timeout so an unresponsive HeyGen endpoint can't ride to the
 *  gateway limit (the avatar-list + generate calls previously had no timeout). */
async function fetchT(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Cache the resolved stock avatar per gender for the life of the (warm) instance —
// the avatar list is stable, so skip the /v2/avatars round-trip on repeat calls.
const avatarCache: Record<string, string> = {};

async function firstStockAvatar(apiKey: string, gender: 'male' | 'female'): Promise<string | null> {
  if (avatarCache[gender]) return avatarCache[gender];
  try {
    const res = await fetchT(`${HEYGEN_BASE}/v2/avatars`, { headers: { 'X-Api-Key': apiKey } }, 15_000);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { avatars?: Array<{ avatar_id: string; gender?: string }> } };
    const avatars = data.data?.avatars ?? [];
    if (!avatars.length) return null;
    const match = avatars.find((a) => (a.gender ?? '').toLowerCase() === gender);
    const id = (match ?? avatars[0])!.avatar_id;
    avatarCache[gender] = id;
    return id;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  // Two POSTs per generation (synthesize + submit), so use the AI tier (10/min)
  // rather than EXPENSIVE (5/min) which a couple of generations would exhaust.
  const rl = await checkRateLimit(req, RATE_LIMITS.AI);
  if (rl) return rl;
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'HeyGen not configured' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; audioUrl?: string; gender?: 'male' | 'female'; orientation?: 'landscape' | 'vertical'; avatarId?: string };
  const gender: 'male' | 'female' = body.gender === 'male' ? 'male' : 'female';

  // ── PHASE A — synthesize the line in the CLONED Georgian voice → public mp3 url.
  // Bounded by synthesizeVoiceover's own 30s ElevenLabs timeout (+ fallbacks +
  // upload), comfortably under 60s. Returns the hosted audio for Phase B.
  if (!body.audioUrl) {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    const audioUrl = await textToHostedSpeech(text.slice(0, 1500), null).catch(() => null);
    if (!audioUrl) return NextResponse.json({ success: false, error: 'voice synthesis failed (no cloned-voice audio)' }, { status: 502 });
    return NextResponse.json({ success: true, phase: 'synthesized', audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
  }

  // ── PHASE B — kick off the AUDIO-DRIVEN avatar video with the hosted audio.
  // Avatar lookup (cached) + HeyGen submit, both timeout-bounded → fast, returns
  // the videoId for the client to poll. No long synthesis here.
  const audioUrl = body.audioUrl;
  const vertical = body.orientation === 'vertical';
  const dimension = vertical ? { width: 720, height: 1280 } : { width: 1280, height: 720 };

  const avatarId = body.avatarId || (await firstStockAvatar(apiKey, gender));
  if (!avatarId) return NextResponse.json({ success: false, error: 'no HeyGen avatar available' }, { status: 502 });

  const genRes = await fetchT(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{
        character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
        voice: { type: 'audio', audio_url: audioUrl },
      }],
      dimension,
    }),
  }, 20_000).catch(() => null);
  if (!genRes || !genRes.ok) {
    const detail = genRes ? (await genRes.text().catch(() => '')).slice(0, 300) : 'request timed out';
    return NextResponse.json({ success: false, error: `HeyGen generate ${genRes?.status ?? 'timeout'}`, detail }, { status: 502 });
  }
  const genJson = (await genRes.json()) as { data?: { video_id?: string }; video_id?: string };
  const videoId = genJson.data?.video_id ?? genJson.video_id;
  if (!videoId) return NextResponse.json({ success: false, error: 'HeyGen returned no video_id' }, { status: 502 });

  return NextResponse.json({ success: true, videoId, audioUrl, avatarId, voiceProvider: 'elevenlabs:cloned-ka' });
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ done: true, error: 'HeyGen not configured' }, { status: 503 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ done: true, error: 'id required' }, { status: 400 });
  try {
    const st = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(id)}`, { headers: { 'X-Api-Key': apiKey } });
    if (!st.ok) return NextResponse.json({ done: false });
    const sj = (await st.json()) as { data?: { status?: string; video_url?: string; error?: unknown } };
    const status = sj.data?.status;
    if (status === 'completed' && sj.data?.video_url) return NextResponse.json({ done: true, url: sj.data.video_url });
    if (status === 'failed') return NextResponse.json({ done: true, error: JSON.stringify(sj.data?.error).slice(0, 300) });
    return NextResponse.json({ done: false });
  } catch {
    return NextResponse.json({ done: false });
  }
}
