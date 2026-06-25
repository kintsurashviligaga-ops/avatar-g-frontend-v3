import { NextRequest, NextResponse } from 'next/server';
import { composeElevenLabsMusic, hasElevenLabsMusicKey } from '@/lib/elevenlabs/music';
import { generateMusicCover, generateVoiceSong, generateMusic } from '@/lib/ai/replicate';
import { transcodeVoiceToMp3 } from '@/lib/audio/transcode';
import { convertSongWithRvc } from '@/lib/audio/rvc';
import { getUserVoiceModel, DEMO_VOICE_USER_ID } from '@/lib/audio/voiceModel';
import { generateNanoBananaImage } from '@/lib/nanobanana/client';
import { uploadAndSign, createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

/**
 * Assistant music generation (Udio).
 *
 * POST { prompt } → { success, url }. The Smart Assistant's Music mode sends a
 * vibe/description here; Udio composes a cohesive cinematic instrumental, which
 * is then RE-HOSTED to Supabase Storage (CSP media-src allows *.supabase.co) so
 * the <audio> element plays + the track persists past Udio's short-lived CDN URL.
 *
 * Synchronous start+poll, bounded WELL under the 300s function ceiling. Udio is
 * the founder's funded provider (credits confirmed live); the poll is resilient
 * to transient feed blips (see lib/udio/client). Fail-closed with a clean reason
 * on a real miss; fail-open on the re-host (keeps the provider URL).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

// Host a data: reference track to a signed https URL — Replicate MusicGen fetches the
// melody by URL, so an uploaded audio file is copied to Supabase first. Fail-open → null.
async function hostAudioReference(dataUrl: string): Promise<string | null> {
  try {
    const m = dataUrl.match(/^data:([^;,]+)[;,]/);
    const mime = (m?.[1] || 'audio/mpeg').toLowerCase();
    const ext = /wav/i.test(mime) ? 'wav' : /ogg/i.test(mime) ? 'ogg' : /mp4|m4a|aac/i.test(mime) ? 'm4a' : 'mp3';
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] ?? '' : '';
    if (!b64) return null;
    const path = `omni-music-ref/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, b64, mime, 7200)) || null;
  } catch {
    return null;
  }
}

// Suno-style album cover art for a generated track — themed to the brief + genre, so
// the visual matches the song. Square, text-free. Fail-open → null (no cover).
async function generateCoverArt(songPrompt: string, style: string): Promise<string | null> {
  try {
    const coverPrompt = `Album cover art for a ${style || 'cinematic'} music track. Mood and theme: ${songPrompt.slice(0, 220)}. Evocative, atmospheric, striking, professional album artwork, square composition, high detail. NO text, no words, no letters, no captions, no logos.`;
    const result = await generateNanoBananaImage({
      // 2K cover art — sharper album artwork. It runs in parallel with the (slower)
      // track, so the extra ~13s still lands well before the song finishes.
      prompt: coverPrompt,
      endpoint: 'v2-2k',
      aspectRatio: '1:1',
      pollMaxAttempts: 90,
      pollIntervalMs: 2500,
    });
    if (!result.url) return null;
    // Re-host to a CSP-allowed Supabase URL (provider URL is temp + blocked by img-src).
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 20_000);
    const r = await fetch(result.url, { signal: ac.signal }).finally(() => clearTimeout(to));
    if (!r.ok) return result.url;
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const ext = /png/i.test(ct) ? 'png' : /webp/i.test(ct) ? 'webp' : 'jpg';
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.byteLength > 18 * 1024 * 1024) return result.url;
    const path = `omni-music-cover/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return (await uploadAndSign('uploads', path, buf.toString('base64'), ct, 604800)) || result.url;
  } catch {
    return null;
  }
}

// v330 — standalone music composition via ElevenLabs Music (the master audio engine,
// replacing Udio), with Replicate MusicGen as the graceful fallback. EL Music returns
// audio BYTES, so they're hosted to Supabase first; the result is always a fetchable URL.
async function composeTrackUrl(prompt: string, style: string, instrumental: boolean, lengthSec = 30): Promise<string> {
  const secs = Math.max(15, Math.min(90, Math.round(lengthSec) || 30));
  if (hasElevenLabsMusicKey()) {
    try {
      const { audio, contentType } = await composeElevenLabsMusic({
        prompt: style ? `${prompt}. Style: ${style}.` : prompt,
        lengthMs: secs * 1000,
        instrumental,
      });
      const path = `omni-music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
      const url = await uploadAndSign('uploads', path, audio.toString('base64'), contentType, 604800);
      if (url) return url;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[ai/music] ElevenLabs Music failed → MusicGen fallback:', e instanceof Error ? e.message : e);
    }
  }
  const score = await generateMusic(style ? `${prompt}, ${style}` : prompt, secs);
  if (!score.audioUrl) throw new Error('Music generation did not complete in time.');
  return score.audioUrl;
}

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;

  let prompt = '';
  let style = 'cinematic';
  let makeInstrumental = true;
  let lyrics = '';
  let audioReference = '';
  let voiceReference = '';
  let useMyVoice = false;
  let durationSec = 30;
  let tempo = '';
  let voiceType: 'female' | 'male' | 'duet' | '' = '';
  try {
    const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; style?: unknown; instrumental?: unknown; lyrics?: unknown; audioReference?: unknown; voiceReference?: unknown; useMyVoice?: unknown; durationSec?: unknown; tempo?: unknown; voiceType?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (typeof body.style === 'string' && body.style.trim()) style = body.style.trim();
    if (typeof body.instrumental === 'boolean') makeInstrumental = body.instrumental;
    // P6 — duration (15/30/60/90) + tempo (slow/medium/fast). Duration drives the track
    // length; tempo is folded into the prompt as a BPM/feel hint the model honours.
    if (typeof body.durationSec === 'number' && body.durationSec > 0) durationSec = Math.max(15, Math.min(90, Math.round(body.durationSec)));
    if (typeof body.tempo === 'string') tempo = body.tempo.trim().toLowerCase();
    // Custom lyrics (vocal tracks) — Udio sings these verbatim; empty → auto lyrics.
    if (typeof body.lyrics === 'string' && body.lyrics.trim()) lyrics = body.lyrics.trim().slice(0, 2000);
    // Cover: an uploaded reference track (data: URL) → Udio reimagines it in the
    // requested style/prompt.
    // data: (small fallback) | https URL | storage path (browser-uploaded) — the
    // cover branch resolves each to a fetchable melody URL.
    if (typeof body.audioReference === 'string' && body.audioReference.trim()) audioReference = body.audioReference.trim();
    // Voice clone: an uploaded sample of the USER'S voice (>15s, data:/https/path) →
    // MiniMax sings the lyrics in that voice. Highest-priority branch below.
    if (typeof body.voiceReference === 'string' && body.voiceReference.trim()) voiceReference = body.voiceReference.trim();
    // Use the user's TRAINED RVC voice (faithful) instead of a one-shot reference.
    if (body.useMyVoice === true) useMyVoice = true;
    // Sung-vocal gender for a SONG → appended to the prompt as vocal descriptors
    // (the music engine is prompt-steered for the singer; see vocalDescriptor below).
    if (body.voiceType === 'female' || body.voiceType === 'male' || body.voiceType === 'duet') voiceType = body.voiceType;
  } catch {
    /* malformed body → guard below */
  }

  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  // Fold the tempo selection into the brief as a feel/BPM hint (empty for 'medium').
  const tempoHint = tempo === 'slow' ? 'Slow tempo, around 70 BPM. ' : tempo === 'fast' ? 'Fast, upbeat tempo, around 140 BPM. ' : '';
  const capped = (tempoHint + prompt).slice(0, 1000);

  // Sung-vocal gender → prompt engineering. The music engine (ElevenLabs Music /
  // MusicGen) is steered by the text prompt, so the singer's gender rides in the
  // brief. Only meaningful for a SONG (non-instrumental).
  const vocalDescriptor =
    !makeInstrumental && voiceType
      ? voiceType === 'female'
        ? 'female vocals, female singer'
        : voiceType === 'male'
          ? 'male vocals, male singer'
          : 'male and female duet, two singers (one male and one female trading lines)'
      : '';

  try {
    // Suno-style cover art — generated in PARALLEL with the track (it's the faster of
    // the two, so it adds no latency) and themed to the song's brief + genre.
    const coverArtPromise = generateCoverArt(capped, style);

    // COVER vs compose: with an uploaded reference track, REPLICATE MusicGen-melody
    // re-imagines it in the requested style (conditioned on the track's melody);
    // otherwise Udio composes a fresh track from the brief.
    let providerAudioUrl = '';
    const trainedModel = useMyVoice ? await (async () => { try { const { user } = await authedClientFromRequest(req); return await getUserVoiceModel(user?.id ?? DEMO_VOICE_USER_ID); } catch { return null; } })() : null;
    if (trainedModel) {
      // FAITHFUL "sing in my voice": ElevenLabs Music composes a song WITH vocals, then
      // realistic-voice-cloning (RVC) swaps those vocals for the user's TRAINED model.
      // Fail-open: if the convert misses, return the composed song so the user still gets a track.
      const composedUrl = await composeTrackUrl(lyrics ? `${capped}. Lyrics: ${lyrics}` : capped, style, false, durationSec);
      try {
        providerAudioUrl = await convertSongWithRvc(composedUrl, trainedModel.modelUrl);
      } catch {
        providerAudioUrl = composedUrl;
      }
    } else if (voiceReference) {
      // "Create a song in MY voice" — resolve the user's uploaded voice sample to an
      // https URL (data: → host · https → use · path → sign the browser upload) and
      // have MiniMax sing the lyrics in that voice (zero-shot, ## adds accompaniment).
      const voiceUrl = voiceReference.startsWith('data:')
        ? await hostAudioReference(voiceReference)
        : /^https?:\/\//i.test(voiceReference)
          ? voiceReference
          : await createSignedAssetUrl(process.env.UPLOAD_BUCKET || 'uploads', voiceReference, 3600);
      if (!voiceUrl) {
        return NextResponse.json({ success: false, error: 'Could not process the voice file.' }, { status: 502 });
      }
      // Normalize the clip to MP3 first — the browser records webm/mp4 and users upload
      // m4a/ogg, none of which MiniMax reliably accepts ("doesn't generate"). Fail-open:
      // if transcoding hiccups we still try the original (works when it was already wav/mp3).
      const mp3Voice = await transcodeVoiceToMp3(voiceUrl);
      // Lyrics are what MiniMax sings; fall back to the brief if the user only gave a vibe.
      const song = await generateVoiceSong(lyrics || capped, { voiceUrl: mp3Voice || voiceUrl });
      providerAudioUrl = song.audioUrl;
    } else if (audioReference) {
      // Resolve the melody to an https URL Replicate can fetch:
      //  • data:  → host it (small fallback)
      //  • https  → use directly
      //  • path   → a storage object uploaded by the browser via /api/upload/sign
      //             (bypasses the function-body limit); sign a readable URL now that
      //             the object exists.
      const melodyUrl = audioReference.startsWith('data:')
        ? await hostAudioReference(audioReference)
        : /^https?:\/\//i.test(audioReference)
          ? audioReference
          : await createSignedAssetUrl(process.env.UPLOAD_BUCKET || 'uploads', audioReference, 3600);
      if (!melodyUrl) {
        return NextResponse.json({ success: false, error: 'Could not process the reference audio.' }, { status: 502 });
      }
      const styledPrompt = style ? `${capped}, ${style} style` : capped;
      const cover = await generateMusicCover(styledPrompt, melodyUrl, 30);
      providerAudioUrl = cover.audioUrl;
    } else {
      // Compose a fresh track from the brief — ElevenLabs Music (sung when not
      // instrumental), MusicGen fallback. Lyrics, if given, steer the prompt; the
      // vocal descriptor (female/male/duet) is appended for a sung track.
      const composeBrief = vocalDescriptor ? `${capped}. ${vocalDescriptor}.` : capped;
      providerAudioUrl = await composeTrackUrl(lyrics ? `${composeBrief}. Lyrics: ${lyrics}` : composeBrief, style, makeInstrumental, durationSec);
    }

    // RE-HOST to Supabase so the audio plays in-app (CSP-allowed) + persists.
    let hostedUrl = providerAudioUrl;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 25_000);
      const r = await fetch(providerAudioUrl, { signal: ac.signal }).finally(() => clearTimeout(to));
      if (r.ok) {
        const ct = r.headers.get('content-type') || 'audio/mpeg';
        const ext = /wav/i.test(ct) ? 'wav' : 'mp3';
        const b64 = Buffer.from(await r.arrayBuffer()).toString('base64');
        const path = `omni-music/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const signed = await uploadAndSign('uploads', path, b64, ct, 604800); // 7-day signed URL
        if (signed) hostedUrl = signed;
      }
    } catch {
      /* fail-open — keep the provider URL */
    }

    // File the track into the Library — under the signed-in user, or the shared demo
    // identity when testing without sign-in (so anonymous generations still show up).
    try {
      const { user } = await authedClientFromRequest(req);
      await recordCompletedAsset({ id: randomUUID(), userId: user?.id ?? DEMO_VOICE_USER_ID, serviceType: 'music', url: hostedUrl, prompt: capped });
    } catch {
      /* fail-open */
    }

    // The cover finished while the track generated — attach it for the result card.
    const coverUrl = await coverArtPromise;
    return NextResponse.json({ success: true, url: hostedUrl, ...(coverUrl ? { coverUrl } : {}) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Music generation failed';
    // eslint-disable-next-line no-console
    console.error('[ai/music]', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
