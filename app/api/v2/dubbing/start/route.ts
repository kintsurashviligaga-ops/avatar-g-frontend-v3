import { NextRequest, NextResponse } from 'next/server';
import { refuseOutsideEngine } from '@/lib/providers/mediaPolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v2/dubbing/start — Master Task §2.3.2 / §4.6.
 *
 * The dub heard the source with ElevenLabs Scribe and spoke each line with ElevenLabs' timed TTS. Google has no engine
 * here that keeps both the per-word timings and the line timing, so every request is refused with 503 google_only
 * before the session, the quote, ffmpeg or any provider call (MASTER TASK v3.1, PR 5e, lib/providers/mediaPolicy).
 * Production already answered `pricing_not_approved` (OWNER_APPROVED_PRICING had no dubbing price), so no user loses a
 * running service.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  return refuseOutsideEngine(req);
}
