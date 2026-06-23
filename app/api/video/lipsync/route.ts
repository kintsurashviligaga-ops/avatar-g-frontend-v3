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
import { lipsyncCreate, filmLipsyncCreate, lipsyncFetch, hasLipsyncProvider, lipsyncStatus, heygenSelfTest } from '@/lib/ai/lipsync';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { convertSongWithRvc } from '@/lib/audio/rvc';
import { getUserVoiceModel, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { uploadAndSign, reSignIfInternal, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';

// Same bucket uploadBigFile() / the /api/upload/sign route write user files into.
const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';

// Resolve an incoming media reference to a provider-fetchable https URL:
//  • external https → passed through · internal Supabase https → re-signed ·
//  • a BARE storage path from uploadBigFile() (e.g. "omni-uploads/…") → signed.
// Anything else (data:, other schemes) → null. This is the fix that makes the
// "attach a video/photo" lipsync flow actually work — uploadBigFile returns a PATH,
// which the old https-only guard silently rejected.
async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  if (/^https:\/\//i.test(s)) return reSignIfInternal(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // reject data:/file:/other schemes
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600); // bare internal storage path
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Wav2Lip on a 30s 1080p master needs headroom

/**
 * GET — without ?id: names-only readiness probe. With ?id=<predictionId>: poll that
 * lip-sync job ONCE → { done, url } when finished (re-hosted to Supabase), or
 * { done:false } while still rendering. This short-request polling is what makes the
 * ~150s SadTalker render survive mobile networks (a single long fetch gets dropped).
 */
export async function GET(req: NextRequest) {
  // Guarded HeyGen self-test — PROVE the "Avatar" engine end-to-end (server-side, with the
  // real runtime key) BEFORE flipping LIPSYNC_HEYGEN on for real traffic.
  //   GET /api/video/lipsync?selftest=heygen&key=<MIGRATION_RUN_KEY>
  if (req.nextUrl.searchParams.get('selftest') === 'heygen') {
    const key = req.headers.get('x-selftest-key'); // header, not query — keep the secret out of URLs/logs
    if (!key || key !== process.env.MIGRATION_RUN_KEY) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    const faceUrl = 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512&q=80';
    const audioUrl = await textToHostedSpeech('Hello, this is an Avatar voice test. One, two, three.');
    if (!audioUrl) return NextResponse.json({ error: 'tts-failed' }, { status: 502 });
    return NextResponse.json(await heygenSelfTest(faceUrl, audioUrl));
  }
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json(lipsyncStatus());

  const { status, url, error } = await lipsyncFetch(id);
  if (status === 'succeeded' && url) {
    // Re-host the talking video to a stable Supabase URL (the provider URL expires ~1h).
    let hosted = url;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 45_000); // route has 300s headroom; fewer fail-opens to the expiring URL
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
    return NextResponse.json({ done: true, url: hosted });
  }
  if (status === 'failed' || status === 'canceled') return NextResponse.json({ done: true, url: null, error });
  return NextResponse.json({ done: false });
}

/**
 * POST — START a lip-sync job (async). Speaks the typed text (ElevenLabs, optionally
 * the user's trained RVC voice), dispatches SadTalker, and returns { jobId } fast. The
 * client polls GET ?id=jobId. Synchronous rendering was dropping on mobile (~150s).
 */
export async function POST(req: NextRequest) {
  if (!hasLipsyncProvider()) return NextResponse.json({ jobId: null });

  let body: { videoUrl?: unknown; audioUrl?: unknown; text?: unknown; useMyVoice?: unknown; forceSadTalker?: unknown; gender?: unknown; kind?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ jobId: null });
  }

  // Resolve the face image (external https, internal https, OR a bare upload path).
  const videoUrl = await resolveMedia(body.videoUrl);
  if (!videoUrl) return NextResponse.json({ jobId: null });
  let audioUrl: string = (await resolveMedia(body.audioUrl)) ?? videoUrl;

  // "Speak this text": type a script → ElevenLabs → optionally the user's TRAINED voice.
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1200) : '';
  if (text) {
    // Honour an explicit Female/Male choice via the cloned-voice map; otherwise let
    // textToHostedSpeech auto-pick by persona.
    const g = body.gender === 'male' ? 'male' : body.gender === 'female' ? 'female' : null;
    const ttsUrl = await textToHostedSpeech(text, g ? georgianVoiceId(g) : undefined);
    // If TTS failed, FAIL CLEANLY instead of falling through with audioUrl===videoUrl
    // (the face image) — that would lip-sync the photo to itself and waste a provider
    // job before surfacing a generic failure minutes later.
    if (!ttsUrl) return NextResponse.json({ jobId: null, error: 'tts-failed' });
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

  // kind:'film' → multi-shot video master needs the VIDEO-INPUT engine (sync/lipsync-2),
  // not the talking-photo engines. Falls back to null → caller keeps the un-synced master.
  if (body.kind === 'film') {
    const jobId = await filmLipsyncCreate(videoUrl, audioUrl);
    return NextResponse.json({ jobId });
  }
  // forceSadTalker → skip HeyGen (the client sets this on a retry after a HeyGen job failed).
  const jobId = await lipsyncCreate(videoUrl, audioUrl, { skipHeygen: body.forceSadTalker === true });
  return NextResponse.json({ jobId });
}
