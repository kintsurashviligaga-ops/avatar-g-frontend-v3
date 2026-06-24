/**
 * POST /api/audio/georgian-song — build a real GEORGIAN-vocal song for a music video.
 * Body: { brief, gender?, totalSec? } → { url } (Georgian rap/hook on the cloned KA
 * voice, mixed over a funk instrumental) or { url: null } on any miss (caller then
 * falls back to the normal ElevenLabs Music path).
 */
import { NextRequest, NextResponse } from 'next/server';
import { generateGeorgianSong } from '@/lib/audio/georgianSong';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let body: { brief?: unknown; gender?: unknown; totalSec?: unknown };
  try {
    body = (await req.json()) as { brief?: unknown; gender?: unknown; totalSec?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
  const gender: 'male' | 'female' = body.gender === 'male' ? 'male' : 'female';
  const totalSec = Number.isFinite(Number(body.totalSec)) && Number(body.totalSec) > 0 ? Math.min(30, Number(body.totalSec)) : 30;
  if (!brief) return NextResponse.json({ url: null });
  const url = await generateGeorgianSong(brief, gender, totalSec, req.signal).catch(() => null);
  return NextResponse.json({ url });
}
