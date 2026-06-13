import { NextRequest, NextResponse } from 'next/server';
import { generateUdioTrack } from '@/lib/udio/client';
import { generateMusicCover } from '@/lib/ai/replicate';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { recordCompletedAsset } from '@/lib/orchestrator/jobs';
import { randomUUID } from 'node:crypto';

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

export async function POST(req: NextRequest) {
  let prompt = '';
  let style = 'cinematic';
  let makeInstrumental = true;
  let lyrics = '';
  let audioReference = '';
  try {
    const body = (await req.json().catch(() => ({}))) as { prompt?: unknown; style?: unknown; instrumental?: unknown; lyrics?: unknown; audioReference?: unknown };
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (typeof body.style === 'string' && body.style.trim()) style = body.style.trim();
    if (typeof body.instrumental === 'boolean') makeInstrumental = body.instrumental;
    // Custom lyrics (vocal tracks) — Udio sings these verbatim; empty → auto lyrics.
    if (typeof body.lyrics === 'string' && body.lyrics.trim()) lyrics = body.lyrics.trim().slice(0, 2000);
    // Cover: an uploaded reference track (data: URL) → Udio reimagines it in the
    // requested style/prompt.
    if (typeof body.audioReference === 'string' && (body.audioReference.startsWith('data:') || /^https?:\/\//i.test(body.audioReference))) audioReference = body.audioReference;
  } catch {
    /* malformed body → guard below */
  }

  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  const capped = prompt.slice(0, 1000);

  try {
    // COVER vs compose: with an uploaded reference track, REPLICATE MusicGen-melody
    // re-imagines it in the requested style (conditioned on the track's melody);
    // otherwise Udio composes a fresh track from the brief.
    let providerAudioUrl = '';
    if (audioReference) {
      // https (browser-uploaded via /api/upload/sign — bypasses the function-body
      // limit) → use directly; data: (small fallback) → host it first. Replicate
      // fetches the melody by URL.
      const melodyUrl = audioReference.startsWith('data:') ? await hostAudioReference(audioReference) : audioReference;
      if (!melodyUrl) {
        return NextResponse.json({ success: false, error: 'Could not process the reference audio.' }, { status: 502 });
      }
      const styledPrompt = style ? `${capped}, ${style} style` : capped;
      const cover = await generateMusicCover(styledPrompt, melodyUrl, 30);
      providerAudioUrl = cover.audioUrl;
    } else {
      const result = await generateUdioTrack(
        { prompt: capped, style, makeInstrumental, title: capped.slice(0, 60), ...(lyrics ? { lyrics } : {}) },
        // ~230s ceiling (46 × 5s) — safely under the 300s maxDuration, leaving room
        // for the re-host + response. Udio chirp typically lands in 60–180s.
        { maxAttempts: 46, pollIntervalMs: 5000 },
      );
      if (result.status !== 'succeeded' || !result.audioUrl) {
        return NextResponse.json(
          { success: false, error: result.message || 'Music generation did not complete in time.' },
          { status: 502 },
        );
      }
      providerAudioUrl = result.audioUrl;
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

    // Best-effort: file the track into the signed-in user's Library (Audio tab).
    try {
      const { user } = await authedClientFromRequest(req);
      if (user) {
        await recordCompletedAsset({ id: randomUUID(), userId: user.id, serviceType: 'music', url: hostedUrl, prompt: capped });
      }
    } catch {
      /* fail-open */
    }

    return NextResponse.json({ success: true, url: hostedUrl });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Music generation failed';
    // eslint-disable-next-line no-console
    console.error('[ai/music]', message);
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
