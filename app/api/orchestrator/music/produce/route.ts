/**
 * POST /api/orchestrator/music/produce — RETIRED. This "Music Generation Swarm" dispatched every song to Udio
 * (/api/udio/generate), which is outside the approved music provider boundary (PROJECT_MASTER R7, Music Studio v1
 * Phase 2). Refused always, before any reservation. Music Studio (/api/music/studio, Google Lyria) replaces it.
 */
import { NextRequest } from 'next/server';
import { musicUnsupportedResponse } from '@/lib/music/studio/boundary';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  return musicUnsupportedResponse(req);
}
