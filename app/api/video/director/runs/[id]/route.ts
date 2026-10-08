/**
 * GET /api/video/director/runs/[id] — the run as it stands (its owner only; anyone else gets 404). Reads only: a
 * stuck shot moves on POST …/advance, never on a GET.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { DirectorRunNotFoundError, viewOf } from '@/lib/video/director/run';
import { directorErrorResponse, isRunId, directorRoutesClosed, refuseDirectorCaller } from '@/lib/video/director/runHttp';
import { supabaseRunStore } from '@/lib/video/director/runServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: { id: string } }): Promise<NextResponse> {
  const closed = directorRoutesClosed();
  if (closed) return closed;
  const { user } = await authedClientFromRequest(req);
  const refused = await refuseDirectorCaller(req, user, RATE_LIMITS.READ);
  if (refused || !user) return refused ?? NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!isRunId(params.id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const run = await supabaseRunStore().load(params.id, user.id);
    if (!run) throw new DirectorRunNotFoundError();
    return NextResponse.json({ run: viewOf(run) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return directorErrorResponse(err, 'get');
  }
}
