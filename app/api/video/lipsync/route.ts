/**
 * POST /api/video/lipsync — OPT-IN Wav2Lip pass for a finished film master.
 *
 * The client calls this AFTER the 30s master is ready, only when the user toggled
 * lip-sync on and a soundtrack/vocal is present. It runs Wav2Lip on Replicate
 * (shared REPLICATE_API_TOKEN) keying the on-screen mouth(s) to the audio.
 *
 * Isolated from the proven assemble path so it can NEVER break a film: on any
 * failure (no token, model error, timeout, empty result) it returns
 * { url: null } and the client keeps the original master. Request body:
 *   { videoUrl: string (https), audioUrl?: string (https) }
 * `audioUrl` defaults to `videoUrl` — the master already carries the mixed
 * soundtrack, so the model keys the lips to the film's own embedded audio (and we
 * avoid pushing a multi-MB soundtrack data-URI at the provider). Response:
 *   { url: string | null }
 */
import { NextRequest, NextResponse } from 'next/server';
import { lipsyncVideo, hasLipsyncProvider, lipsyncStatus } from '@/lib/ai/lipsync';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { convertSongWithRvc } from '@/lib/audio/rvc';
import { getUserVoiceModel, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Wav2Lip on a 30s 1080p master needs headroom

/**
 * GET — names-only readiness probe ({ ready, model, faceField, audioField }) so the
 * lipsync wiring is verifiable without spending a render. No secret is ever
 * returned. The toggle hits exactly this model (devxpy/cog-wav2lip by default,
 * overridable via LIPSYNC_REPLICATE_MODEL).
 */
export async function GET() {
  return NextResponse.json(lipsyncStatus());
}

const isHttps = (u: unknown): u is string =>
  typeof u === 'string' && /^https:\/\/[^\s]+$/i.test(u) && u.length < 4000;

export async function POST(req: NextRequest) {
  if (!hasLipsyncProvider()) return NextResponse.json({ url: null });

  let body: { videoUrl?: unknown; audioUrl?: unknown; text?: unknown; useMyVoice?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ url: null });
  }

  // Only accept https URLs (the master the app itself produced) — no arbitrary or
  // internal targets cross into the provider. audioUrl defaults to the master.
  if (!isHttps(body.videoUrl)) {
    return NextResponse.json({ url: null });
  }
  let audioUrl: string = isHttps(body.audioUrl) ? body.audioUrl : body.videoUrl;

  // "Dub from text": type a script → speak it (ElevenLabs) → optionally re-voice it in
  // the user's TRAINED voice (RVC) → that becomes the audio the lips are keyed to.
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1200) : '';
  if (text) {
    const ttsUrl = await textToHostedSpeech(text);
    if (ttsUrl) {
      audioUrl = ttsUrl;
      if (body.useMyVoice === true) {
        try {
          const { user } = await authedClientFromRequest(req);
          const model = await getUserVoiceModel(user?.id ?? DEMO_VOICE_USER_ID);
          if (model) {
            const converted = await convertSongWithRvc(ttsUrl, model.modelUrl);
            if (converted) audioUrl = converted;
          }
        } catch {
          /* keep the TTS voice */
        }
      }
    }
  }

  const url = await lipsyncVideo(body.videoUrl, audioUrl);
  if (!url) return NextResponse.json({ url: null });

  // Re-host the Wav2Lip output to a stable Supabase URL — the provider URL expires in
  // ~1h, so a saved talking video would otherwise break. Fail-open → provider URL.
  let hosted = url;
  try {
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 30_000);
    const r = await fetch(url, { signal: ac.signal }).finally(() => clearTimeout(to));
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.byteLength && buf.byteLength <= 80 * 1024 * 1024) {
        const path = `lipsync/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp4`;
        const signed = await uploadAndSign('uploads', path, buf.toString('base64'), 'video/mp4', 604_800);
        if (signed) hosted = signed;
      }
    }
  } catch {
    /* fail-open — keep the provider URL */
  }
  return NextResponse.json({ url: hosted });
}
