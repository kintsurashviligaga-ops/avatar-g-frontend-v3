/**
 * POST /api/video/director/plan — a DRAFT storyboard for the user to read, edit and approve (V2). Nothing is rendered or
 * charged here; the draft comes back with `approvedByUser: false` whatever the planner wrote, and only the user's
 * approval (POST /api/video/director/runs) freezes it. Gemini drafts (googleOnly), never another vendor (V1).
 *
 * Off unless VIDEO_DIRECTOR_RUNS allows this user (lib/video/director/runServer).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { shotCredits } from '@/lib/video/director/run';
import { directorErrorResponse, directorRoutesClosed, refuseDirectorCaller } from '@/lib/video/director/runHttp';
import { createGoogleVideoDirector } from '@/lib/video/director/server';
import { parsePlanInput } from '@/lib/video/director/planInput';
import { shotsInOrder } from '@/lib/video/director/storyboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const closed = directorRoutesClosed();
  if (closed) return closed;
  const { user } = await authedClientFromRequest(req);
  const refused = await refuseDirectorCaller(req, user, RATE_LIMITS.EXPENSIVE);
  if (refused || !user) return refused ?? NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = parsePlanInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: 'invalid_input', problems: parsed.problems }, { status: 400 });

  try {
    const storyboard = await createGoogleVideoDirector().planStoryboard(parsed.input);
    const quoteCredits = shotCredits(shotsInOrder(storyboard)).reduce((sum, c) => sum + c, 0);
    return NextResponse.json({ storyboard, quoteCredits });
  } catch (err) {
    return directorErrorResponse(err, 'plan');
  }
}
