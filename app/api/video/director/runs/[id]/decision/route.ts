/**
 * POST /api/video/director/runs/[id]/decision — the user's answer to a failed shot (V2, V5): `retry` renders the same
 * frozen shot again (a new, separately charged attempt), `edit` ends the run and returns a new unapproved draft of the
 * storyboard, `cancel` ends it keeping the finished clips. There is no skip. A decision that does not apply to the run
 * as it stands is a 409. Off unless VIDEO_DIRECTOR_RUNS allows this user.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { SHOT_DECISIONS } from '@/lib/video/director/director';
import { decideRun } from '@/lib/video/director/run';
import { directorErrorResponse, isRunId, directorRoutesClosed, refuseDirectorCaller } from '@/lib/video/director/runHttp';
import { liveDirectorRunDeps } from '@/lib/video/director/runServer';
import type { ShotDecision } from '@/lib/video/director/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function POST(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const closed = directorRoutesClosed();
  if (closed) return closed;
  const { user } = await authedClientFromRequest(req);
  const refused = await refuseDirectorCaller(req, user, RATE_LIMITS.WRITE);
  if (refused || !user) return refused ?? NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isRunId(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { decision?: unknown } | null;
  const decision = body?.decision;
  if (typeof decision !== 'string' || !SHOT_DECISIONS.includes(decision as ShotDecision)) {
    return NextResponse.json({ error: 'invalid_input', problems: [`decision must be ${SHOT_DECISIONS.join(', ')}`] }, { status: 400 });
  }
  try {
    const { view, draft } = await decideRun(liveDirectorRunDeps(), params.id, user.id, decision as ShotDecision);
    return NextResponse.json({ run: view, ...(draft ? { draft } : {}) });
  } catch (err) {
    return directorErrorResponse(err, 'decision');
  }
}
