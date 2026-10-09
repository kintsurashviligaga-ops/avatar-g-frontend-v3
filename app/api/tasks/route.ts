/**
 * /api/tasks — ONE door to the caller's tasks (EF-7; lib/tasks): every job the studio, the text chat, a Live voice call
 * or Agent G started, in one shape (lib/tasks/taskView TaskView), whatever runs it.
 *
 *   GET ?id=…                     one task of the caller's: { ok: true, task } or 404 not_found.
 *   GET [?active=1][&limit=n]     the caller's newest tasks (at most 20), live ones only with `active`.
 *   POST { action: 'cancel', id } stop one: a lease job (Agent G's montage, audio extraction) through its executor;
 *                                 a studio render has no server-side stop and answers 409 not_cancellable.
 *
 * Owner-only: a session is required, every read is scoped to the caller, and anyone else's id is not_found. Reading a
 * lease job here is also its recovery (a job no worker holds gets one, as on the job's own route), but only while
 * AGENT_G_MEDIA_EXEC is open to the caller; while it is closed this route still reads and stops, it never starts work.
 * The /api/tasks/<uuid>/status and /cancel routes below this folder are the older Agent G pipeline's (agent_g_tasks).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentMediaOpenTo } from '@/lib/agent/media/access';
import { cancelTask, listTasks, MAX_LIST, readTask } from '@/lib/tasks/taskService';
import { liveTaskDeps } from '@/lib/tasks/taskLive';
import { parseTaskId } from '@/lib/tasks/taskView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A read can start a lease job's worker after its answer (a montage render, an audio extraction): their budget.
export const maxDuration = 600;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const notFound = () => NextResponse.json({ ok: false, error: 'not_found', message: 'No such task.' }, { status: 404, headers: NO_STORE });

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;

  const deps = liveTaskDeps();
  const q = req.nextUrl.searchParams;
  if (q.has('id')) {
    const id = parseTaskId(q.get('id'));
    if (!id) return notFound();
    const task = await readTask(deps, { userId: user.id, id, workersOpen: agentMediaOpenTo(user) });
    return task ? NextResponse.json({ ok: true, task }, { headers: NO_STORE }) : notFound();
  }
  const limit = Number(q.get('limit') ?? MAX_LIST);
  const tasks = await listTasks(deps, { userId: user.id, active: q.get('active') === '1', limit: Number.isFinite(limit) ? limit : MAX_LIST });
  return NextResponse.json({ ok: true, tasks }, { headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (body?.action !== 'cancel') return NextResponse.json({ ok: false, error: 'bad_action' }, { status: 400 });
  const id = parseTaskId(body.id);
  if (!id) return notFound();
  const r = await cancelTask(liveTaskDeps(), { userId: user.id, id });
  if (r.ok) return NextResponse.json(r, { headers: NO_STORE });
  if (r.error === 'not_found') return notFound();
  return NextResponse.json(r, { status: 409, headers: NO_STORE });
}
