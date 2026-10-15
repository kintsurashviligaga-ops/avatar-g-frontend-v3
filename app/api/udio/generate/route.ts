/**
 * POST /api/udio/generate — RETIRED. Udio is outside the approved music provider boundary (PROJECT_MASTER R7, Music
 * Studio v1 Phase 2: Google Lyria for music). Refused always, before any charge or provider call. Music Studio
 * (/api/music/studio) replaces it. Kept as a route so an old client gets a clear answer instead of a 404.
 */
import { NextRequest } from 'next/server';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';
import { musicUnsupportedResponse } from '@/lib/music/studio/boundary';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  // MEDIA_GOOGLE_ONLY keeps its own paused-tool answer when it is on (lib/providers/mediaPolicy GATED_ENTRIES).
  return refuseOutsideEngine(req) ?? musicUnsupportedResponse(req);
}
