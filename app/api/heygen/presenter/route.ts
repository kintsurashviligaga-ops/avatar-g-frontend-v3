import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { heygenLipsyncCreate } from '@/lib/ai/lipsync';

/**
 * /api/heygen/presenter — "Presenter mode"
 * ========================================
 * A consistent HeyGen presenter speaks a script in the user's CLONED GEORGIAN VOICE.
 * We synthesize the line with our cloned eleven_v3 voice first, host it, then drive
 * a DEFAULT presenter face through HeyGen's fast `talking_photo` path with
 * `voice.type:'audio'` so the lips track native Georgian.
 *
 * WHY talking_photo (not a stock `avatar`): HeyGen's /v2/avatars list is unusably
 * slow on our account (>40s — it was the root of the original gateway 504s). The
 * talking_photo upload host (/v1/talking_photo) is fast and is the same proven path
 * the photo-driven lip-sync uses, so the presenter rides a default bundled face.
 *
 * TWO-PHASE START + POLL (mobile-safe, neither request nears the gateway limit):
 *   POST { text, orientation? }   → { success, phase:'synthesized', audioUrl }  (Phase A: TTS only, ~4s)
 *   POST { audioUrl, faceUrl? }   → { success, videoId, audioUrl }              (Phase B: talking_photo submit)
 *   GET  ?id=<videoId>            → { done, url, error }                         (quick poll)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const HEYGEN_BASE = 'https://api.heygen.com';
/** Bundled default presenter portrait (public asset) — front-facing, neutral. */
const DEFAULT_FACE_PATH = '/presenter/default-female.jpg';

export async function POST(req: NextRequest) {
  // Two POSTs per generation (synthesize + submit), so use the AI tier (10/min)
  // rather than EXPENSIVE (5/min) which a couple of generations would exhaust.
  const rl = await checkRateLimit(req, RATE_LIMITS.AI);
  if (rl) return rl;
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'HeyGen not configured' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; audioUrl?: string; faceUrl?: string; orientation?: 'landscape' | 'vertical' };

  // ── PHASE A — synthesize the line in the CLONED Georgian voice → public mp3 url.
  // TTS only (no HeyGen calls here), so it stays ~4s — comfortably under 60s.
  if (!body.audioUrl) {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    const audioUrl = await textToHostedSpeech(text.slice(0, 1500), null).catch(() => null);
    if (!audioUrl) return NextResponse.json({ success: false, error: 'voice synthesis failed (no cloned-voice audio)' }, { status: 502 });
    return NextResponse.json({ success: true, phase: 'synthesized', audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
  }

  // ── PHASE B — drive the default presenter face with the hosted audio via HeyGen's
  // talking_photo path (upload + submit, both internally timeout-bounded → fast).
  const audioUrl = body.audioUrl;
  const faceUrl = body.faceUrl && /^https?:\/\//.test(body.faceUrl)
    ? body.faceUrl
    : new URL(DEFAULT_FACE_PATH, req.nextUrl.origin).toString();

  const handle = await heygenLipsyncCreate(faceUrl, audioUrl).catch(() => null);
  const videoId = handle?.startsWith('heygen:') ? handle.slice('heygen:'.length) : null;
  if (!videoId) return NextResponse.json({ success: false, error: 'HeyGen talking_photo submit failed' }, { status: 502 });

  return NextResponse.json({ success: true, videoId, audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
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
