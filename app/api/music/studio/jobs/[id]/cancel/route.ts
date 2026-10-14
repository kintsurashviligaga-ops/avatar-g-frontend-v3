/** POST /api/music/studio/jobs/:id/cancel — the owner stops a queued or running track; what was reserved is refunded once. */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { cancelMusic } from '@/lib/music/studio/engine';
import { liveMusicDeps } from '@/lib/music/studio/live';
import { musicErrorResponse, musicUser } from '@/lib/music/studio/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rl) return rl;
  const who = await musicUser(req);
  if ('response' in who) return who.response;
  try {
    return NextResponse.json(await cancelMusic(liveMusicDeps(), who.userId, params.id));
  } catch (e) {
    return musicErrorResponse(e, req);
  }
}
