/**
 * POST /api/ads/tts — ad narration with per-character timings for word-synced captions.
 *
 * It ran on ElevenLabs' with-timestamps TTS. Cloud TTS has no character timings for these voices, so the route cannot
 * keep its contract on Google, and every request is refused with 503 google_only before the session, the limit or any
 * provider call (MASTER TASK v3.1, PR 5e, lib/providers/mediaPolicy). Nothing in the app calls it.
 */
import { NextRequest } from 'next/server';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}
