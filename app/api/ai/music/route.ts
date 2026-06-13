import { NextRequest, NextResponse } from 'next/server';
import { generateUdioTrack, generateUdioUploadCover } from '@/lib/udio/client';
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
    if (typeof body.audioReference === 'string' && body.audioReference.startsWith('data:')) audioReference = body.audioReference;
  } catch {
    /* malformed body → guard below */
  }

  if (!prompt) {
    return NextResponse.json({ success: false, error: 'prompt is required' }, { status: 400 });
  }

  const capped = prompt.slice(0, 1000);

  try {
    // COVER vs compose: with an uploaded reference track, Udio re-creates it in the
    // requested style (upload-cover); otherwise compose a fresh track from the brief.
    const coverBuffer = audioReference
      ? Buffer.from(audioReference.slice(audioReference.indexOf(',') + 1), 'base64')
      : null;
    const result = coverBuffer
      ? await generateUdioUploadCover(
          { audioBlob: coverBuffer, prompt: capped, style, title: capped.slice(0, 60) },
          { maxAttempts: 46, pollIntervalMs: 5000 },
        )
      : await generateUdioTrack(
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

    // RE-HOST to Supabase so the audio plays in-app (CSP-allowed) + persists.
    let hostedUrl = result.audioUrl;
    try {
      const ac = new AbortController();
      const to = setTimeout(() => ac.abort(), 25_000);
      const r = await fetch(result.audioUrl, { signal: ac.signal }).finally(() => clearTimeout(to));
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
