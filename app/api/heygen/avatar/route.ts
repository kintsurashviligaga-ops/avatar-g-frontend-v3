import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { guardGeneration } from '@/lib/api/generationGuard';
import { deductCredits } from '@/lib/orchestrator/ledger';
import { creditCostFor } from '@/lib/credits/pricing';

export const dynamic = 'force-dynamic';
// The HeyGen create-chain (getVoiceId + getFirstStockAvatar + createVideo) can
// exceed 60s, which hit Vercel's function limit → 504 FUNCTION_INVOCATION_TIMEOUT
// (every avatar generation failed before returning a videoId). Raised to 300 to
// match the other heavy routes (produce, ai/music) so the start call completes.
export const maxDuration = 300;

const HEYGEN_BASE = 'https://api.heygen.com';

// PHASE 39 §2 — avatar framing is user-driven, not a locked default. Normalize
// any caller-supplied style into the values HeyGen accepts.
function normalizeAvatarStyle(value?: string): 'normal' | 'circle' | 'closeUp' {
  const v = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
  if (v === 'circle') return 'circle';
  if (v === 'closeup' || v === 'close') return 'closeUp';
  return 'normal';
}

function normalizeTalkingPhotoStyle(value?: string): 'square' | 'circle' | 'rectangle' {
  const v = String(value || '').toLowerCase().replace(/[\s_-]/g, '');
  if (v === 'square') return 'square';
  if (v === 'circle') return 'circle';
  return 'rectangle';
}

// ─── Voice mapping by gender + language ──────────────────────────────────────

const VOICE_MAP: Record<string, Record<string, string>> = {
  // Curated HeyGen voice IDs — fallback to Jenny/Guy if not found
  female: {
    en: '1bd001e7e50f421d891986aad5158bc8', // Lily (en-US female)
    ru: 'a50d990a4bd14da4a49d0f4d10310a6b', // Natasha (ru-RU female)
    ka: '1bd001e7e50f421d891986aad5158bc8', // fallback to English
    de: '1bd001e7e50f421d891986aad5158bc8',
    fr: '1bd001e7e50f421d891986aad5158bc8',
    es: '1bd001e7e50f421d891986aad5158bc8',
  },
  male: {
    en: '2d5b0e6cf36f460aa7fc47e3eee4ba54', // Josh (en-US male)
    ru: 'a50d990a4bd14da4a49d0f4d10310a6b',
    ka: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
    de: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
    fr: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
    es: '2d5b0e6cf36f460aa7fc47e3eee4ba54',
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * All HeyGen provider fetches share a request timeout so one stalled call can't pin the 300s lambda —
 * the /v2/avatars list is documented (presenter route) as unusably slow (>40s). On timeout the caller's
 * existing try/catch / !res.ok path fires → the same 502/fallback already produced. Additive.
 */
const HEYGEN_TIMEOUT_MS = 30_000;
async function heygenFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(HEYGEN_TIMEOUT_MS) });
}

async function getVoiceId(apiKey: string, gender: string, language: string): Promise<string> {
  try {
    const res = await heygenFetch(`${HEYGEN_BASE}/v2/voices`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new Error('voices list failed');
    const data = await res.json() as { data?: { voices?: Array<{ voice_id: string; language?: string; gender?: string }> } };
    const voices = data.data?.voices ?? [];
    const langCode = language === 'ka' ? 'en' : language; // Georgian → fallback to English TTS
    const match = voices.find(v =>
      v.gender?.toLowerCase() === gender.toLowerCase() &&
      v.language?.toLowerCase().startsWith(langCode.toLowerCase())
    );
    return match?.voice_id ?? VOICE_MAP[gender]?.[language] ?? VOICE_MAP['female']!['en']!;
  } catch {
    return VOICE_MAP[gender]?.[language] ?? VOICE_MAP['female']!['en']!;
  }
}

async function getFirstStockAvatar(apiKey: string): Promise<string> {
  const res = await heygenFetch(`${HEYGEN_BASE}/v2/avatars`, {
    headers: { 'X-Api-Key': apiKey },
  });
  if (!res.ok) throw new Error(`HeyGen avatars list failed: ${res.status}`);
  const data = await res.json() as { data?: { avatars?: Array<{ avatar_id: string }> } };
  const first = data.data?.avatars?.[0];
  if (!first) throw new Error('No avatars found in HeyGen account');
  return first.avatar_id;
}

async function uploadPhotoAsset(apiKey: string, photoBase64: string, mimeType: string): Promise<string> {
  // Strip data URL prefix if present
  const base64Data = (photoBase64.includes(',') ? photoBase64.split(',')[1] : photoBase64) ?? '';
  // Cap the decoded upload so a huge payload can't OOM the lambda (real selfies are well under ~9MB).
  if (base64Data.length > 12_000_000) throw new Error('photo too large (max ~9MB)');
  const binaryData = Buffer.from(base64Data, 'base64');
  const uint8 = new Uint8Array(binaryData.buffer, binaryData.byteOffset, binaryData.byteLength);
  const blob = new Blob([uint8], { type: mimeType || 'image/jpeg' });

  const formData = new FormData();
  formData.append('file', blob, 'avatar_photo.jpg');
  formData.append('type', 'image');

  const res = await heygenFetch(`${HEYGEN_BASE}/v1/asset`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen asset upload failed ${res.status}: ${err}`);
  }

  const data = await res.json() as { data?: { id?: string; asset_id?: string } };
  const assetId = data.data?.id ?? data.data?.asset_id;
  if (!assetId) throw new Error('HeyGen asset upload returned no ID');
  return assetId;
}

async function createTalkingPhoto(apiKey: string, assetId: string): Promise<string> {
  const res = await heygenFetch(`${HEYGEN_BASE}/v1/talking_photo`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_asset_id: assetId }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen talking_photo failed ${res.status}: ${err}`);
  }

  const data = await res.json() as { data?: { talking_photo_id?: string } };
  const talkingPhotoId = data.data?.talking_photo_id;
  if (!talkingPhotoId) throw new Error('HeyGen returned no talking_photo_id');
  return talkingPhotoId;
}

async function createVideoWithTalkingPhoto(
  apiKey: string,
  talkingPhotoId: string,
  voiceId: string,
  script: string,
  dimension: { width: number; height: number },
  talkingPhotoStyle: string,
): Promise<string> {
  const res = await heygenFetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{
        character: {
          type: 'talking_photo',
          talking_photo_id: talkingPhotoId,
          talking_photo_style: talkingPhotoStyle,
        },
        voice: {
          type: 'text',
          input_text: script.slice(0, 1500),
          voice_id: voiceId,
        },
      }],
      dimension,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen video/generate ${res.status}: ${err}`);
  }
  const data = await res.json() as { data?: { video_id?: string }; video_id?: string };
  const videoId = data.data?.video_id ?? data.video_id;
  if (!videoId) throw new Error('HeyGen returned no video_id');
  return videoId;
}

async function createVideoWithStockAvatar(
  apiKey: string,
  avatarId: string,
  voiceId: string,
  script: string,
  dimension: { width: number; height: number },
  avatarStyle: string,
): Promise<string> {
  const res = await heygenFetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      video_inputs: [{
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: avatarStyle,
        },
        voice: {
          type: 'text',
          input_text: script.slice(0, 1500),
          voice_id: voiceId,
        },
      }],
      dimension,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`HeyGen video/generate ${res.status}: ${err}`);
  }
  const data = await res.json() as { data?: { video_id?: string }; video_id?: string };
  const videoId = data.data?.video_id ?? data.video_id;
  if (!videoId) throw new Error('HeyGen returned no video_id');
  return videoId;
}

// ─── Route handler ────────────────────────────────────────────────────────────
// POST → returns { videoId } immediately; client polls GET ?videoId=xxx

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;

  // FINANCIAL SHIELD — require a signed-in user with balance before the paid HeyGen avatar render.
  // Avatar resolves ASYNC (client polls GET ?videoId), so the actual charge happens on completion in
  // GET (ref-idempotent per videoId) — never at dispatch, so a failed render is never billed.
  const guard = await guardGeneration(req, 'avatar');
  if (!guard.ok) return guard.response;

  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'HEYGEN_API_KEY not configured' }, { status: 500 });
  }

  try {
    const body = await req.json() as {
      script?: string;
      prompt?: string;
      photoBase64?: string;
      photoMimeType?: string;
      voiceGender?: string;
      voiceLanguage?: string;
      videoFormat?: string;
      avatarId?: string;
      voiceId?: string;
      avatarStyle?: string;
      talkingPhotoStyle?: string;
    };

    const script = (body.script ?? body.prompt ?? '').trim();
    if (!script) {
      return NextResponse.json({ success: false, error: 'script is required' }, { status: 400 });
    }

    const voiceGender   = body.voiceGender   ?? 'female';
    const voiceLanguage = body.voiceLanguage ?? 'en';
    const videoFormat   = body.videoFormat   ?? '16:9';
    const avatarStyle        = normalizeAvatarStyle(body.avatarStyle);
    const talkingPhotoStyle  = normalizeTalkingPhotoStyle(body.talkingPhotoStyle);

    const dimension =
      videoFormat === '9:16' ? { width: 720, height: 1280 } :
      videoFormat === '1:1'  ? { width: 720, height: 720  } :
                               { width: 1280, height: 720 };

    const voiceId = body.voiceId ?? await getVoiceId(apiKey, voiceGender, voiceLanguage);

    let videoId: string;

    if (body.photoBase64) {
      const assetId       = await uploadPhotoAsset(apiKey, body.photoBase64, body.photoMimeType ?? 'image/jpeg');
      const talkingPhotoId = await createTalkingPhoto(apiKey, assetId);
      videoId = await createVideoWithTalkingPhoto(apiKey, talkingPhotoId, voiceId, script, dimension, talkingPhotoStyle);
    } else {
      const avatarId = body.avatarId ?? await getFirstStockAvatar(apiKey);
      videoId = await createVideoWithStockAvatar(apiKey, avatarId, voiceId, script, dimension, avatarStyle);
    }

    return NextResponse.json({ success: true, videoId, status: 'processing' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'HeyGen avatar generation failed';
    console.error('[heygen/avatar]', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}

// GET ?videoId=xxx — lightweight status check, called by client every 5 s
export async function GET(req: NextRequest) {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 500 });

  // FINANCIAL SHIELD — auth-only (a poll starts no new compute, so it is NOT balance-gated).
  const guard = await guardGeneration(req, 'avatar', { gate: false });
  if (!guard.ok) return guard.response;

  const videoId = req.nextUrl.searchParams.get('videoId');
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 });

  try {
    const res = await heygenFetch(`${HEYGEN_BASE}/v1/video_status.get?video_id=${encodeURIComponent(videoId)}`, {
      headers: { 'X-Api-Key': apiKey },
    });
    if (!res.ok) throw new Error(`HeyGen status ${res.status}`);

    const data = await res.json() as {
      data?: { status?: string; video_url?: string; thumbnail_url?: string; duration?: number; error?: string };
    };
    const d = data.data ?? {};

    // Charge on COMPLETION (never at dispatch → a failed render is never billed). deduct_credits is
    // ref-idempotent on `avatar:<videoId>`, so the client polling every 5s after completion charges
    // exactly ONCE. Best-effort: the asset is already produced, so a ledger hiccup never fails the poll,
    // and deduct_credits rejects overdraw (the balance can never go negative).
    if (d.status === 'completed' && d.video_url) {
      void deductCredits(guard.userId, creditCostFor('avatar'), `avatar:${videoId}`)
        .catch(() => { /* best-effort — asset already delivered */ });
    }

    return NextResponse.json({
      status:       d.status    ?? 'processing',
      url:          d.video_url ?? null,
      thumbnail:    d.thumbnail_url ?? null,
      duration:     d.duration  ?? null,
      error:        d.error     ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Status check failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
