/**
 * POST /api/audio/isolate — vocal isolation for the singer lip-sync.
 *
 * It ran on the ElevenLabs Voice Isolator for the HeyGen singer pass, which PR 5c already refused. Neither has a Google
 * engine, so every request is refused with 503 google_only before the session, the limit, the fetch of the song or any
 * provider call (MASTER TASK v3.1, PR 5e, lib/providers/mediaPolicy).
 */
import { NextRequest } from 'next/server';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  return refuseOutsideEngine(req);
}
