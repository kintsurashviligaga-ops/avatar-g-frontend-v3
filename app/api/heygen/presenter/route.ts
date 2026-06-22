import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';

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
/** Bundled default presenter portrait — pin to the CANONICAL public domain, never
 *  req.nextUrl.origin (on Vercel that can be the auth-protected *.vercel.app
 *  deployment host, which 401s the self-fetch). Overridable via env. */
const DEFAULT_FACE_URL = process.env.PRESENTER_FACE_URL || 'https://myavatar.ge/presenter/default-female.jpg';

// HeyGen caps photo avatars (talking_photos) at 3 on this plan. Uploading a NEW one
// per call exhausts that cap (error 401028) — so REUSE: resolve a talking_photo_id
// from the account's existing photos and cache it; only upload the default face if
// none exist. Cached for the life of the (warm) instance.
let cachedTalkingPhotoId: string | null = null;

/** Pull the first existing talking_photo_id from the account (tries the known list
 *  endpoints; tolerant of either response shape). Returns null if none/none-found. */
async function firstExistingTalkingPhoto(apiKey: string): Promise<string | null> {
  const endpoints = ['https://api.heygen.com/v1/talking_photo.list', 'https://api.heygen.com/v2/talking_photos'];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(15_000) });
      if (!r.ok) continue;
      const j = (await r.json().catch(() => ({}))) as unknown;
      // Find the first talking_photo_id anywhere in the payload (shape varies by version).
      const id = findTalkingPhotoId(j);
      if (id) return id;
    } catch { /* try next endpoint */ }
  }
  return null;
}

function findTalkingPhotoId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (typeof obj.talking_photo_id === 'string' && obj.talking_photo_id) return obj.talking_photo_id;
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) { for (const item of v) { const id = findTalkingPhotoId(item); if (id) return id; } }
    else if (v && typeof v === 'object') { const id = findTalkingPhotoId(v); if (id) return id; }
  }
  return null;
}

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
  const vertical = body.orientation === 'vertical';
  const dimension = vertical ? { width: 720, height: 1280 } : { width: 1280, height: 720 };
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

  // DIAG: ?probe=1 — probe candidate HeyGen list endpoints; report status + a
  // truncated body so we can see which one actually returns existing talking_photo
  // IDs on this account. Sanitized: only first 400 chars of each body.
  const url = new URL(req.url);
  if (url.searchParams.get('probe') === '1') {
    const candidates = [
      'https://api.heygen.com/v1/talking_photo.list',
      'https://api.heygen.com/v2/talking_photos',
      'https://api.heygen.com/v2/talking_photo',
      'https://api.heygen.com/v1/talking_photo_avatar.list',
      'https://api.heygen.com/v2/photo_avatar/list',
      'https://api.heygen.com/v2/avatar_group.list',
    ];
    const results = await Promise.all(candidates.map(async (u) => {
      try {
        const r = await fetch(u, { headers: { 'X-Api-Key': apiKey }, signal: AbortSignal.timeout(15_000) });
        const t = await r.text().catch(() => '');
        return { url: u, status: r.status, body: t.slice(0, 400) };
      } catch (e) { return { url: u, status: 'error', body: String(e).slice(0, 200) }; }
    }));
    return NextResponse.json({ probe: true, results });
  }

  const id = url.searchParams.get('id');
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
