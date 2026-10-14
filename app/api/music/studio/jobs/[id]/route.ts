/**
 * GET /api/music/studio/jobs/:id — the owner's view of one job: status, named stage (never an invented percent),
 * settlement, and on delivery a freshly signed link. A job no worker holds (its worker died) is taken over here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { musicStatus, workMusic } from '@/lib/music/studio/engine';
import { liveMusicDeps } from '@/lib/music/studio/live';
import { musicErrorResponse, musicUser } from '@/lib/music/studio/http';
import { newWorkerId } from '@/lib/agent/media/montageLive';
import { runAfterResponse } from '@/lib/platform/afterResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const who = await musicUser(req);
  if ('response' in who) return who.response;
  const rl = await checkRateLimit(req, RATE_LIMITS.READ, who.userId); // per user, not per shared IP
  if (rl) return rl;
  try {
    const deps = liveMusicDeps();
    const { view, needsWorker } = await musicStatus(deps, who.userId, params.id);
    if (needsWorker) {
      const work = () => workMusic(deps, params.id, newWorkerId());
      if (!runAfterResponse(work, 'music-studio.takeover')) void work().catch(() => undefined);
    }
    return NextResponse.json(view, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return musicErrorResponse(e, req);
  }
}
