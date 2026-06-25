/**
 * POST /api/video/remix — edit an EXISTING (user-uploaded) video.
 *
 * One route, one `op` discriminator, so the Video Remix panel can run any of:
 *   trim       — cut a window out of the clip (ffmpeg)
 *   captions   — burn a title / caption lower-third onto it (ffmpeg overlay)
 *   voiceover  — synthesize AI narration and mix it under the audio (ffmpeg)
 *   music      — lay an uploaded track over the video (replace or duck-mix)
 *   redub      — lip-sync the speaker to new TTS text or an uploaded track (Wav2Lip)
 *   restyle    — re-imagine the look: keyframe → image restyle → i2v re-animate
 *   character  — replace / insert a character: keyframe → character swap → i2v
 *
 * Every op is STRICTLY fail-open: a miss returns { url: null, error } and the
 * client keeps the original. The actual wallet charge is unchanged (the client
 * shows the credit toast); this route just produces the edited media URL.
 *
 * Request: { op, videoUrl, ... per-op params }   Response: { url, error? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { trimClip } from '@/lib/video/trimClip';
import { muxAudioOntoVideo, extractFrame, kenBurnsClip, klingI2v } from '@/lib/video/remixOps';
import { overlayMasterUrl } from '@/lib/pipeline/compositing/ffmpeg-overlay';
import { textToHostedSpeech } from '@/lib/chat/filmVoiceover';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { lipsyncCreate, lipsyncFetch } from '@/lib/ai/lipsync';
import { reSignIfInternal, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const UPLOAD_BUCKET = process.env.UPLOAD_BUCKET || 'uploads';
type Aspect = '9:16' | '16:9' | '1:1';
type Gender = 'male' | 'female';

/** Resolve a client media ref (https / bare storage path) to a fetchable https URL. */
async function resolveMedia(v: unknown): Promise<string | null> {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s || s.length > 4000) return null;
  if (/^https:\/\//i.test(s)) return reSignIfInternal(s);
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return null; // reject data:/other schemes
  return createSignedAssetUrl(UPLOAD_BUCKET, s, 3600);
}

const ok = (url: string | null, extra: Record<string, unknown> = {}) => NextResponse.json({ url, ...extra });
const fail = (error: string) => NextResponse.json({ url: null, error });

// Lip-sync (Wav2Lip) create + bounded poll — the redub op's engine.
async function runLipsync(videoUrl: string, audioUrl: string): Promise<string | null> {
  const id = await lipsyncCreate(videoUrl, audioUrl).catch(() => null);
  if (!id) return null;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 4_000));
    const s = await lipsyncFetch(id).catch(() => null);
    if (!s) continue;
    if (s.status === 'succeeded' && s.url) return s.url;
    if (s.status === 'failed' || s.status === 'canceled') return null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || '').trim();
  const videoUrl = await resolveMedia(body.videoUrl);
  if (!videoUrl) return fail('A video is required.');

  const aspect: Aspect = body.aspect === '16:9' || body.aspect === '1:1' ? body.aspect : '9:16';
  const gender: Gender = body.gender === 'male' ? 'male' : 'female';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1500) : '';

  try {
    switch (op) {
      case 'trim': {
        const startSec = Number.isFinite(Number(body.startSec)) ? Math.max(0, Number(body.startSec)) : 0;
        const durationSec = Number.isFinite(Number(body.durationSec)) && Number(body.durationSec) > 0 ? Number(body.durationSec) : 5;
        const url = await trimClip(videoUrl, startSec, durationSec);
        return url ? ok(url) : fail('Trim failed.');
      }

      case 'captions': {
        if (!text) return fail('Add caption text.');
        const cta = typeof body.cta === 'string' ? body.cta.trim().slice(0, 80) : undefined;
        const url = await overlayMasterUrl(videoUrl, { overlayText: text, ...(cta ? { cta } : {}) });
        return url ? ok(url) : fail('Caption burn failed.');
      }

      case 'voiceover': {
        if (!text) return fail('Add the narration text.');
        const vo = await textToHostedSpeech(text, georgianVoiceId(gender));
        if (!vo) return fail('Voice synthesis is unavailable.');
        const url = await muxAudioOntoVideo(videoUrl, vo, 'mix', 12);
        return url ? ok(url) : fail('Mixing the voice-over failed.');
      }

      case 'music': {
        const audioUrl = await resolveMedia(body.audioUrl);
        if (!audioUrl) return fail('Add a music track.');
        const replace = body.mix !== true; // default: replace the original audio
        const url = await muxAudioOntoVideo(videoUrl, audioUrl, replace ? 'replace' : 'mix', 12);
        return url ? ok(url) : fail('Adding the music failed.');
      }

      case 'redub': {
        // Audio source: synthesized from text in the chosen voice, or an upload.
        const uploaded = await resolveMedia(body.audioUrl);
        const audioUrl = uploaded || (text ? await textToHostedSpeech(text, georgianVoiceId(gender)) : null);
        if (!audioUrl) return fail('Add redub text or an audio track.');
        const url = await runLipsync(videoUrl, audioUrl);
        return url ? ok(url) : fail('Lip-sync is unavailable right now.');
      }

      case 'restyle':
      case 'character': {
        // Anchor frame → image model (restyle, or character swap/insert) → re-animate.
        const frame = await extractFrame(videoUrl, 0.5);
        if (!frame) return fail('Could not read a frame from the video.');
        const editPrompt =
          op === 'restyle'
            ? `Restyle this exact scene: ${text || 'cinematic, film-grade color grade'}. Keep the composition and subjects, change only the visual style.`
            : `${text || 'replace the main character with a new person'}. Keep the background, framing and lighting; change the character to match this description.`;
        const styled = await generateNanoBananaImage({
          prompt: editPrompt,
          referenceImageDataUrl: frame,
          aspectRatio: aspect,
        }).catch(() => null);
        const startImage = styled?.url || frame;
        const motionPrompt = op === 'restyle' ? (text || 'cinematic motion') : (text || 'natural character motion');
        // Premium i2v if a token is set, else a guaranteed Ken-Burns animation so the
        // user ALWAYS gets a moving, restyled clip.
        const url = (await klingI2v(startImage, motionPrompt, aspect)) || (await kenBurnsClip(startImage, 5, aspect));
        return url ? ok(url, { still: styled?.url ?? null }) : fail('Restyle failed.');
      }

      default:
        return fail(`Unknown remix operation: ${op || '(none)'}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[video/remix]', op, err instanceof Error ? err.message : err);
    return fail('The remix could not be completed.');
  }
}
