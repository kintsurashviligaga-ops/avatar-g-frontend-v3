/**
 * POST /api/music/studio/edit — trim / volume / mute / fades / join / convert one or more of the caller's own Library
 * tracks with ffmpeg. Always a NEW version; the original is never changed. Free (no provider is called).
 *
 * NOTE: spawns ffmpeg-static — registered in next.config.js outputFileTracingIncludes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { editMusic } from '@/lib/music/studio/edit';
import { liveEditDeps } from '@/lib/music/studio/live';
import { musicErrorResponse, musicUser, readJson } from '@/lib/music/studio/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (rl) return rl;
  const who = await musicUser(req);
  if ('response' in who) return who.response;
  try {
    return NextResponse.json(await editMusic(liveEditDeps(), who.userId, await readJson(req), req.signal));
  } catch (e) {
    return musicErrorResponse(e, req);
  }
}
