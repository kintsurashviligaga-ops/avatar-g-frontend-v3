import { NextRequest } from 'next/server';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

export const dynamic = 'force-dynamic';

/**
 * POST /api/elevenlabs/sound — a sound effect from a text prompt.
 *
 * It ran on ElevenLabs sound-generation, which has no Google engine, so every request is refused with 503 google_only
 * before the session, the limit or any provider call (MASTER TASK v3.1, PR 5e, lib/providers/mediaPolicy). A film's
 * ambience now comes from Veo's own audio.
 */
export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}
