/**
 * POST /api/ads/tts — STEP 2.6 word-synced narration.
 *
 * ElevenLabs with-timestamps TTS for the ad narration → { audioUrl, alignment }. The
 * `alignment` (real character timings) is what the caller hands to /api/video/assemble as
 * `captionAlignment` to burn word-synced Georgian captions. Server-side key only; the audio
 * is hosted to the private `uploads` bucket. Requires ELEVENLABS_API_KEY (prod/preview env).
 */
import { NextRequest, NextResponse } from 'next/server';
import { synthesizeWithTimestamps } from '@/lib/elevenlabs/ttsTimestamps';
import { georgianVoiceId } from '@/lib/audio/georgian-voice';
import { uploadAndSign } from '@/lib/orchestrator/storage-adapter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { text?: unknown; gender?: unknown; voiceId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'text too long (max 2000 chars)' }, { status: 413 });

  const gender = body.gender === 'male' ? 'male' : 'female';
  const voiceId = (typeof body.voiceId === 'string' && body.voiceId.trim()) || georgianVoiceId(gender);

  const r = await synthesizeWithTimestamps(text, voiceId, { stability: 0.48 });
  if (!r.ok) {
    // Surface the real reason (EL status / voice / config) — the key value is never included.
    return NextResponse.json({ error: 'TTS unavailable', reason: r.error, voiceId }, { status: 502 });
  }
  const path = `ad-tts/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
  const audioUrl = await uploadAndSign('uploads', path, r.audioBase64, 'audio/mpeg', 7200);
  return NextResponse.json({ audioUrl, alignment: r.alignment, chars: r.alignment.characters.length });
}
