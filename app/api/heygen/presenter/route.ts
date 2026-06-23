import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';

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
export const maxDuration = 120; // headroom for the final-poll re-host (fetch + Supabase upload)

const HEYGEN_BASE = 'https://api.heygen.com';
/** Bundled default presenter portrait — pin to the CANONICAL public domain, never
 *  req.nextUrl.origin (on Vercel that can be the auth-protected *.vercel.app
 *  deployment host, which 401s the self-fetch). Overridable via env. */
const DEFAULT_FACE_URL = process.env.PRESENTER_FACE_URL || 'https://myavatar.ge/presenter/default-female.jpg';

// HeyGen caps photo avatars (talking_photos) at 3 on this plan. Uploading a NEW one
// per call exhausts that cap (error 401028) — so REUSE: resolve a talking_photo_id
// from the account's existing photos and cache it; only upload the default face if
// none exist. Cached for the life of the (warm) instance.
let cachedTalkingPhotoId: string | null = null;

/** Pull the first existing talking_photo_id from the account.
 *  Endpoint: GET /v1/talking_photo.list → { data: [{ id, image_url, … }, …] }.
 *  The field is `id` (not `talking_photo_id`) on the list shape — a HeyGen quirk
 *  that previously missed the available IDs and fell through to a new upload. */
async function firstExistingTalkingPhoto(apiKey: string): Promise<string | null> {
  try {
    const r = await fetch('https://api.heygen.com/v1/talking_photo.list', { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return null;
    const j = (await r.json().catch(() => null)) as { data?: Array<{ id?: string; talking_photo_id?: string }> } | null;
    const list = j?.data ?? [];
    for (const item of list) {
      const id = item?.id || item?.talking_photo_id;
      if (id) return id;
    }
    return null;
  } catch {
    return null;
  }
}

/** Re-host a finished HeyGen presenter video to a stable 7-day Supabase URL. HeyGen's
 *  result URL expires (~1h) → blank player on revisit (the same issue the photo lip-sync
 *  path already re-hosts to avoid). Fail-open: any miss returns the raw provider URL. */
async function rehostPresenterVideo(providerUrl: string): Promise<string> {
  try {
    const r = await fetch(providerUrl, { signal: AbortSignal.timeout(45_000) });
    if (!r.ok) return providerUrl;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength < 1024 || buf.byteLength > 80 * 1024 * 1024) return providerUrl;
    const path = `presenter/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), 'video/mp4', 604_800)) || providerUrl;
  } catch {
    return providerUrl;
  }
}

export async function POST(req: NextRequest) {
  // Two POSTs per generation (synthesize + submit), so use the AI tier (10/min)
  // rather than EXPENSIVE (5/min) which a couple of generations would exhaust.
  const rl = await checkRateLimit(req, RATE_LIMITS.AI);
  if (rl) return rl;
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ success: false, error: 'HeyGen not configured' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { text?: string; audioUrl?: string; faceUrl?: string; orientation?: 'landscape' | 'vertical' | 'square'; gender?: 'female' | 'male' };

  // ── PHASE A — synthesize the line in the CLONED Georgian voice → public mp3 url.
  // TTS only (no HeyGen calls here), so it stays ~4s — comfortably under 60s.
  if (!body.audioUrl) {
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 });
    // Honour the caller's Female/Male choice via the cloned-voice map; falls back to
    // the female clone when unspecified.
    const gender = body.gender === 'male' ? 'male' : 'female';
    const audioUrl = await textToHostedSpeech(text.slice(0, 1500), georgianVoiceId(gender)).catch(() => null);
    if (!audioUrl) return NextResponse.json({ success: false, error: 'voice synthesis failed (no cloned-voice audio)' }, { status: 502 });
    return NextResponse.json({ success: true, phase: 'synthesized', audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
  }

  // ── PHASE B — drive the default presenter face with the hosted audio via HeyGen's
  // talking_photo path (upload + submit, both internally timeout-bounded → fast).
  const audioUrl = body.audioUrl;
  const faceUrl = body.faceUrl && /^https?:\/\//.test(body.faceUrl) ? body.faceUrl : DEFAULT_FACE_URL;

  // Resolve a talking_photo_id WITHOUT creating new assets when possible:
  //   1) cached → use it
  //   2) reuse an existing account talking_photo (no new upload → no cap hit)
  //   3) only if the account has none, upload the default face
  let talkingPhotoId = cachedTalkingPhotoId;
  if (!talkingPhotoId) talkingPhotoId = await firstExistingTalkingPhoto(apiKey);
  if (!talkingPhotoId) {
    const faceRes = await fetch(faceUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (!faceRes || !faceRes.ok) return NextResponse.json({ success: false, error: 'presenter face unreachable', detail: `${faceUrl.slice(0, 100)} → ${faceRes?.status ?? 'fetch error'}` }, { status: 502 });
    const faceMime = faceRes.headers.get('content-type') || 'image/jpeg';
    const faceBytes = new Uint8Array(await faceRes.arrayBuffer());
    const tpRes = await fetch('https://upload.heygen.com/v1/talking_photo', {
      method: 'POST', headers: { 'X-Api-Key': apiKey, 'Content-Type': faceMime }, body: faceBytes, signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    const tpText = tpRes ? await tpRes.text().catch(() => '') : '';
    if (!tpRes || !tpRes.ok) return NextResponse.json({ success: false, error: `HeyGen talking_photo ${tpRes?.status ?? 'timeout'}`, detail: tpText.slice(0, 300) }, { status: 502 });
    try { talkingPhotoId = JSON.parse(tpText)?.data?.talking_photo_id ?? null; } catch { talkingPhotoId = null; }
  }
  if (!talkingPhotoId) return NextResponse.json({ success: false, error: 'no talking_photo available (account photo-avatar cap reached and none reusable)' }, { status: 502 });
  cachedTalkingPhotoId = talkingPhotoId;

  // 2) Generate the audio-driven video. Capture HeyGen's actual reply.
  const dimension = body.orientation === 'vertical'
    ? { width: 720, height: 1280 }
    : body.orientation === 'square'
      ? { width: 720, height: 720 }
      : { width: 1280, height: 720 };
  const genRes = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST', headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ video_inputs: [{ character: { type: 'talking_photo', talking_photo_id: talkingPhotoId, talking_photo_style: 'square' }, voice: { type: 'audio', audio_url: audioUrl } }], dimension }),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  const genText = genRes ? await genRes.text().catch(() => '') : '';
  if (!genRes || !genRes.ok) return NextResponse.json({ success: false, error: `HeyGen generate ${genRes?.status ?? 'timeout'}`, detail: genText.slice(0, 300) }, { status: 502 });
  const videoId = (() => { try { const j = JSON.parse(genText); return j?.data?.video_id ?? j?.video_id ?? null; } catch { return null; } })();
  if (!videoId) return NextResponse.json({ success: false, error: 'HeyGen generate: no video_id', detail: genText.slice(0, 300) }, { status: 502 });

  return NextResponse.json({ success: true, videoId, audioUrl, voiceProvider: 'elevenlabs:cloned-ka' });
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ done: true, error: 'HeyGen not configured' }, { status: 503 });
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ done: true, error: 'id required' }, { status: 400 });
  try {
    // 10s timeout so a stalled HeyGen status call fails fast (→ {done:false}, client
    // re-polls on its next tick) instead of holding the function until maxDuration.
    const st = await fetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(id)}`, { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(10_000) });
    if (!st.ok) return NextResponse.json({ done: false });
    const sj = (await st.json()) as { data?: { status?: string; video_url?: string; error?: unknown } };
    const status = sj.data?.status;
    if (status === 'completed' && sj.data?.video_url) {
      // Re-host so the player URL survives past HeyGen's ~1h expiry.
      return NextResponse.json({ done: true, url: await rehostPresenterVideo(sj.data.video_url) });
    }
    if (status === 'failed') {
      // Guard against a missing/non-string error — JSON.stringify(undefined) is `undefined`
      // and .slice() on it throws, which would mask the failure as "still processing".
      const e = sj.data?.error;
      const reason = e ? (typeof e === 'string' ? e : JSON.stringify(e)) : 'render failed';
      return NextResponse.json({ done: true, error: reason.slice(0, 300) });
    }
    return NextResponse.json({ done: false });
  } catch {
    return NextResponse.json({ done: false });
  }
}
