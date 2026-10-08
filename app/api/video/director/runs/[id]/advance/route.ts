/**
 * POST /api/video/director/runs/[id]/advance — ONE step of the run (lib/video/director/run.ts advanceRun): claim, charge
 * and submit the current shot, or poll it once and deliver it when Veo is done. The browser calls it every few seconds
 * while the run is `running`; a step with nothing to do changes nothing, so calling it too often is harmless.
 *
 * The first failed shot stops the run in `waiting_for_shot_decision` (V5) and its charge is returned; the answer is
 * POST …/decision. Off unless VIDEO_DIRECTOR_RUNS allows this user.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { advanceRun } from '@/lib/video/director/run';
import { directorErrorResponse, isRunId, directorRoutesClosed, refuseDirectorCaller } from '@/lib/video/director/runHttp';
import { liveDirectorRunDeps } from '@/lib/video/director/runServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A step is a submit (seconds) or one poll plus, when the clip is done, its copy into our storage.
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const closed = directorRoutesClosed();
  if (closed) return closed;
  const { user } = await authedClientFromRequest(req);
  const refused = await refuseDirectorCaller(req, user, RATE_LIMITS.READ);
  if (refused || !user) return refused ?? NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isRunId(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const view = await advanceRun(liveDirectorRunDeps(), params.id, user.id);
    return NextResponse.json({ run: view }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return directorErrorResponse(err, 'advance');
  }
}
