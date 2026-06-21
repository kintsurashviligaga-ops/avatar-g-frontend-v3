import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';

/**
 * POST /api/heygen/presenter
 * ==========================
 * "Presenter mode" — a consistent HeyGen avatar speaks a script in the user's
 * CLONED GEORGIAN VOICE. Unlike the existing avatar route (HeyGen's own TTS, which
 * falls back to English for Georgian), this synthesizes the line with our cloned
 * eleven_v3 voice first, hosts it, and drives the avatar with `voice.type:'audio'`
 * so the lips track real native-Georgian audio.
 *
 * Flow: script → textToHostedSpeech (cloned ka voice → public mp3 url) → HeyGen
 * audio-driven avatar video → poll → { url }. Strictly fail-fast with clear errors
 * (this is a billed leg, so we never silently produce an English-voiced video).
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const HEYGEN_BASE = 'https://api.heygen.com';

interface PresenterBody {
  text?: string;
  gender?: 'male' | 'female';
  orientation?: 'landscape' | 'vertical';
  avatarId?: string;
}

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

  const body = (await req.json().catch(() => ({}))) as PresenterBody;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
  const gender: 'male' | 'female' = body.gender === 'male' ? 'male' : 'female';
  const vertical = body.orientation === 'vertical';
  const dimension = vertical ? { width: 720, height: 1280 } : { width: 1280, height: 720 };

  // 1) Synthesize the line in the CLONED Georgian voice → public mp3 url.
  const audioUrl = await textToHostedSpeech(
    text.slice(0, 1500),
    // pickGeorgianVoiceId inside textToHostedSpeech already gender-detects from text;
    // pass null so it auto-resolves, but the gender hint also drives Google fallback.
    null,
  ).catch(() => null);
  if (!audioUrl) {
    return NextResponse.json({ success: false, error: 'voice synthesis failed (no cloned-voice audio)' }, { status: 502 });
  }

  // 2) Pick a consistent avatar.
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

  // 4) Poll to completion (short clips render in ~30-120s; we have 300s).
  const deadline = Date.now() + 270_000;
  let videoUrl: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const st = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`, { headers: { 'X-Api-Key': apiKey } });
    if (!st.ok) continue;
    const sj = (await st.json()) as { data?: { status?: string; video_url?: string; error?: unknown } };
    const status = sj.data?.status;
    if (status === 'completed' && sj.data?.video_url) { videoUrl = sj.data.video_url; break; }
    if (status === 'failed') {
      return NextResponse.json({ success: false, error: 'HeyGen render failed', detail: JSON.stringify(sj.data?.error).slice(0, 300), audioUrl, videoId }, { status: 502 });
    }
  }
  if (!videoUrl) return NextResponse.json({ success: false, error: 'HeyGen render timed out', videoId, audioUrl }, { status: 504 });

  return NextResponse.json({ success: true, url: videoUrl, videoId, audioUrl, avatarId, voiceProvider: 'elevenlabs:cloned-ka' });
}
