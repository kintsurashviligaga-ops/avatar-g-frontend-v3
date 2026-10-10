/**
 * /api/tasks — ONE door to the caller's tasks (EF-7; lib/tasks): every job the studio, the text chat, a Live voice call
 * or Agent G started, in one shape (lib/tasks/taskView TaskView), whatever runs it.
 *
 *   GET ?id=…[&after=n]           one task of the caller's: { ok: true, task } or 404 not_found. A multi-step run carries
 *                                 its steps and its events; `after` sends only the events numbered above n.
 *   GET [?active=1][&limit=n]     the caller's newest tasks (at most 20), live ones only with `active`.
 *   POST { action: 'cancel', id } stop one: a lease job (Agent G's montage, audio extraction) through its executor, a
 *                                 run with every step job it started; a studio render has no server-side stop and
 *                                 answers 409 not_cancellable.
 *
 * Multi-step Agent G runs (lib/agent/run, PART 2), only while AGENT_G_MEDIA_EXEC is open to the caller:
 *   POST { action: 'plan', spec }               check the steps and sign them at their list price (nothing runs).
 *   POST { action: 'run', spec, token }         the user's tap on that plan: the run is created (once per plan; a
 *                                               second tap replays it) and moves on after the answer.
 *   POST { action: 'approve', id, step, quoteId } the user's yes to one step's own price, bound to that quote.
 *   POST { action: 'resume', id }               a NEW run that carries an ended one on: delivered steps reused, the
 *                                               rest run again (final states never move).
 *
 * Owner-only: a session is required, every read is scoped to the caller, and anyone else's id is not_found. Reading a
 * lease job here is also its recovery (a job no worker holds gets one, as on the job's own route), and reading a run
 * moves it, but only while AGENT_G_MEDIA_EXEC is open to the caller; while it is closed this route still reads and
 * stops, it never starts work. The /api/tasks/<uuid>/status and /cancel routes below this folder are the older Agent G
 * pipeline's (agent_g_tasks).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { checkProduceRate, rateLimitedResponse } from '@/lib/orchestrator/rate-limit';
import { runAfterResponse } from '@/lib/platform/afterResponse';
import { agentMediaOpenTo } from '@/lib/agent/media/access';
import { approveStep, planRun, resumeRun, startRun, tickRun, type RunError } from '@/lib/agent/run/runExec';
import { liveRunDeps } from '@/lib/agent/run/runLive';
import { cancelTask, listTasks, MAX_LIST, readTask } from '@/lib/tasks/taskService';
import { liveTaskDeps } from '@/lib/tasks/taskLive';
import { parseTaskId } from '@/lib/tasks/taskView';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A read can start a lease job's worker after its answer (a montage render, an audio extraction): their budget.
export const maxDuration = 600;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const notFound = () => NextResponse.json({ ok: false, error: 'not_found', message: 'No such task.' }, { status: 404, headers: NO_STORE });

const RUN_STATUS: Record<RunError['error'], number> = {
  bad_spec: 400, not_configured: 503, quote_invalid: 409, quote_changed: 409, quote_expired: 409, jobs_unavailable: 503,
  not_found: 404, not_running: 409, not_waiting: 409, not_final: 409, nothing_to_resume: 409,
};
const runError = (e: RunError) => NextResponse.json(e, { status: RUN_STATUS[e.error], headers: NO_STORE });

/** Move a run on after this answer (or now, off Vercel): its first steps start, their jobs get workers. */
function tickAfter(id: string): void {
  const work = () => tickRun(liveRunDeps(), { id, startWorkers: true });
  if (!runAfterResponse(work, 'agent-run-tick')) void work().catch(() => undefined);
}

/** `after=n`: a non-negative event number, else none. */
function afterOf(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const limited = await checkRateLimit(req, RATE_LIMITS.TASKS, user.id);
  if (limited) return limited;

  const deps = liveTaskDeps();
  const q = req.nextUrl.searchParams;
  if (q.has('id')) {
    const id = parseTaskId(q.get('id'));
    if (!id) return notFound();
    const after = afterOf(q.get('after'));
    const task = await readTask(deps, { userId: user.id, id, workersOpen: agentMediaOpenTo(user), ...(after !== undefined ? { after } : {}) });
    return task ? NextResponse.json({ ok: true, task }, { headers: NO_STORE }) : notFound();
  }
  const limit = Number(q.get('limit') ?? MAX_LIST);
  const tasks = await listTasks(deps, { userId: user.id, active: q.get('active') === '1', limit: Number.isFinite(limit) ? limit : MAX_LIST });
  return NextResponse.json({ ok: true, tasks }, { headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const limited = await checkRateLimit(req, RATE_LIMITS.TASKS, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = body?.action;

  if (action === 'cancel') {
    const id = parseTaskId(body?.id);
    if (!id) return notFound();
    const r = await cancelTask(liveTaskDeps(), { userId: user.id, id });
    if (r.ok) return NextResponse.json(r, { headers: NO_STORE });
    if (r.error === 'not_found') return notFound();
    return NextResponse.json(r, { status: 409, headers: NO_STORE });
  }

  if (action !== 'plan' && action !== 'run' && action !== 'approve' && action !== 'resume') {
    return NextResponse.json({ ok: false, error: 'bad_action' }, { status: 400 });
  }
  // Starting work: only while Agent G's media execution is open to this user.
  if (!agentMediaOpenTo(user)) {
    return NextResponse.json({ ok: false, error: 'not_enabled', message: 'Agent G runs are not open to this account yet.' }, { status: 403, headers: NO_STORE });
  }
  const deps = liveRunDeps();

  if (action === 'plan') {
    const r = await planRun(deps, { userId: user.id, spec: body?.spec });
    return r.ok ? NextResponse.json(r, { headers: NO_STORE }) : runError(r);
  }

  if (action === 'approve') {
    const id = parseTaskId(body?.id);
    if (!id) return notFound();
    const r = await approveStep(deps, { userId: user.id, id, step: body?.step, quoteId: body?.quoteId, startWorkers: true });
    if (!r.ok) return runError(r);
    const task = await readTask(liveTaskDeps(), { userId: user.id, id, workersOpen: false });
    return NextResponse.json({ ok: true, task }, { headers: NO_STORE });
  }

  // run / resume create a run: the per-user produce cap applies (as on /api/agent/run).
  const rate = await checkProduceRate(user.id, Date.now(), 'agent');
  if (!rate.ok) return rateLimitedResponse(rate) as NextResponse;

  if (action === 'run') {
    const r = await startRun(deps, { userId: user.id, spec: body?.spec, token: body?.token });
    if (!r.ok) return runError(r);
    tickAfter(r.runId);
    return NextResponse.json({ ok: true, jobId: r.runId, status: 'queued', replay: r.replay }, { headers: NO_STORE });
  }

  const id = parseTaskId(body?.id);
  if (!id) return notFound();
  const r = await resumeRun(deps, { userId: user.id, id });
  if (!r.ok) return runError(r);
  tickAfter(r.runId);
  return NextResponse.json({ ok: true, jobId: r.runId, status: 'queued', replay: r.replay }, { headers: NO_STORE });
}
