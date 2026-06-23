/**
 * POST /api/audio/isolate — Stage 2 vocal isolation for the HeyGen singer lip-sync.
 * Body: { audioUrl }. Returns { vocalUrl } (the backing stripped via the ElevenLabs
 * Voice Isolator) or { vocalUrl: null } on any miss — the caller then falls back to
 * the full song mix, so the HeyGen pass always proceeds.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isolateVocal } from '@/lib/elevenlabs/audioIsolation';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { audioUrl?: unknown };
  try {
    body = (await req.json()) as { audioUrl?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const audioUrl = typeof body.audioUrl === 'string' ? body.audioUrl.trim() : '';
  if (!audioUrl) return NextResponse.json({ vocalUrl: null });
  const vocalUrl = await isolateVocal(audioUrl, req.signal).catch(() => null);
  return NextResponse.json({ vocalUrl });
}
