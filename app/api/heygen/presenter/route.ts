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
 * START + POLL (mobile-safe, like /api/video/lipsync):
 *   POST { text, gender?, orientation? } → { success, videoId, audioUrl }  (fast)
 *   GET  ?id=<videoId>                   → { done, url, error }            (quick poll)
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const HEYGEN_BASE = 'https://api.heygen.com';

async function firstStockAvatar(apiKey: string, gender: 'male' | 'female'): Promise<string | null> {
  try {
    const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, { headers: { 'X-Api-Key': apiKey } });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { avatars?: Array<{ avatar_id: string; gender?: string }> } };
    const avatars = data.data?.avatars ?? [];
    if (!avatars.length) return null;
    const match = avatars.find((a) => (a.gender ?? '').toLowerCase() === gender);
    return (match ?? avatars[0])!.avatar_id;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'HeyGen not configured' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; gender?: 'male' | 'female'; orientation?: 'landscape' | 'vertical'; avatarId?: string };
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
  const gender: 'male' | 'female' = body.gender === 'male' ? 'male' : 'female';
  const vertical = body.orientation === 'vertical';
  const dimension = vertical ? { width: 720, height: 1280 } : { width: 1280, height: 720 };

  // 1) Synthesize the line in the CLONED Georgian voice → public mp3 url.
  const audioUrl = await textToHostedSpeech(text.slice(0, 1500), null).catch(() => null);
  if (!audioUrl) return NextResponse.json({ success: false, error: 'voice synthesis failed (no cloned-voice audio)' }, { status: 502 });

  // 2) Consistent avatar.
  const avatarId = body.avatarId || (await firstStockAvatar(apiKey, gender));
  if (!avatarId) return NextResponse.json({ success: false, error: 'no HeyGen avatar available' }, { status: 502 });

  // 3) Create an AUDIO-DRIVEN avatar video (lips track our cloned-voice audio).
  const genRes = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{
        character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
        voice: { type: 'audio', audio_url: audioUrl },
      }],
      dimension,
    }),
  });
  if (!genRes.ok) {
    return NextResponse.json({ success: false, error: `HeyGen generate ${genRes.status}`, detail: (await genRes.text()).slice(0, 300) }, { status: 502 });
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
