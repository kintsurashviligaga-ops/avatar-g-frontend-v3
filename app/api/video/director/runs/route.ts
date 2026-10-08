/**
 * POST /api/video/director/runs — the user's approval: the edited draft is checked against every storyboard rule, frozen
 * (V2) and stored as a run with every shot pending. Nothing is charged or rendered yet; the browser then drives the run
 * with POST …/runs/[id]/advance, and each shot is charged just before its own submit.
 *
 * Body: { storyboard } with `approvedByUser: true` — the user pressed Approve. Anything the rules refuse is a 400 that
 * lists every problem; nothing is "fixed" on the way (V6).
 *
 * Off unless VIDEO_DIRECTOR_RUNS allows this user (lib/video/director/runServer).
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { startRun } from '@/lib/video/director/run';
import { directorErrorResponse, directorRoutesClosed, refuseDirectorCaller } from '@/lib/video/director/runHttp';
import { liveDirectorRunDeps } from '@/lib/video/director/runServer';
import { freeze } from '@/lib/video/director/storyboard';
import type { Storyboard } from '@/lib/video/director/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/** One run renders at most this many shots (the planner's own ceiling): 12 × 8 s at most. */
const MAX_SHOTS = 12;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const closed = directorRoutesClosed();
  if (closed) return closed;
  const { user } = await authedClientFromRequest(req);
  const refused = await refuseDirectorCaller(req, user, RATE_LIMITS.WRITE);
  if (refused || !user) return refused ?? NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { storyboard?: unknown } | null;
  const draft = body?.storyboard as Storyboard | undefined;
  if (!draft || typeof draft !== 'object' || !Array.isArray(draft.shots)) {
    return NextResponse.json({ error: 'invalid_input', problems: ['storyboard is required'] }, { status: 400 });
  }
  if (draft.shots.length > MAX_SHOTS) {
    return NextResponse.json({ error: 'invalid_input', problems: [`a run renders at most ${MAX_SHOTS} shots`] }, { status: 400 });
  }

  try {
    // freeze() validates and refuses an unapproved draft; what it returns is a deep-frozen, independent copy.
    const storyboard = freeze(draft);
    const view = await startRun(liveDirectorRunDeps(), { id: randomUUID(), userId: user.id, storyboard });
    return NextResponse.json({ run: view }, { status: 201 });
  } catch (err) {
    return directorErrorResponse(err, 'start');
  }
}
