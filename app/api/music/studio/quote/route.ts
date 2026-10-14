/** POST /api/music/studio/quote — a request in, a plan + price + signed quote out. Never charges. */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { quoteMusic } from '@/lib/music/studio/engine';
import { liveMusicDeps } from '@/lib/music/studio/live';
import { musicErrorResponse, musicUser, readJson } from '@/lib/music/studio/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const who = await musicUser(req);
  if ('response' in who) return who.response;
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE, who.userId); // per user, not per shared IP
  if (rl) return rl;
  try {
    return NextResponse.json(await quoteMusic(liveMusicDeps(), who.userId, await readJson(req)));
  } catch (e) {
    return musicErrorResponse(e, req);
  }
}
