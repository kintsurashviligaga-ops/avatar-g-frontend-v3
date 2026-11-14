/**
 * GET /api/tasks/stream?id=…[&after=n][&lang=ka|en|ru] — one of the caller's tasks as Server-Sent Events, for the chat's
 * live timeline card (GG 2026-11-06 06:30Z). Each change of the task is one `agent_progress` event (lib/tasks/
 * agentProgress: total_steps, current_step, step_details, every step's status, and the whole TaskView); `end` when
 * the task ends, `gone` when there is no such task of the caller's, `reconnect` at the function's time limit.
 *
 * Each read is a GET of /api/tasks?id=… on this same deployment with the caller's own session (cookie and bearer passed
 * through): the owner rules, the scoping to the caller and the rate limit are that route's, and so is what a read does
 * (a lease job no worker holds gets one, a run moves on). This route itself reaches no AI vendor and runs no worker: it
 * only relays. A read that is not an answer (a 5xx, a 429, a protected Preview) is read again; a few in a row hand the
 * browser back to its own polling. A client that cannot hold a stream keeps reading /api/tasks.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { parseTaskId, type TaskView } from '@/lib/tasks/taskView';
import { streamTask } from '@/lib/tasks/progressStream';
import { agentMediaOpenTo } from '@/lib/agent/media/access';
import { mintRelayTicket, relayTicketEnabled, RELAY_HEADER } from '@/lib/tasks/relayTicket';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Every 2 s: each read spends one of the caller's /api/tasks tokens (120 a minute), and the browser stops its own
 * 3 s reads while the stream lives, so two cards streaming at once stay well under the limit.
 */
const RELAY_INTERVAL_MS = 2_000;

export async function GET(req: NextRequest): Promise<Response> {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'unauthenticated' }, { status: 401 });
  const limited = await checkRateLimit(req, RATE_LIMITS.TASKS, user.id);
  if (limited) return limited;

  const q = req.nextUrl.searchParams;
  const id = parseTaskId(q.get('id'));
  if (!id) return NextResponse.json({ ok: false, error: 'not_found', message: 'No such task.' }, { status: 404 });
  const rawAfter = q.get('after');
  const n = rawAfter === null ? NaN : Number(rawAfter);
  const after = Number.isInteger(n) && n >= 0 ? n : undefined;
  // The caller's own session, passed through to the one task route.
  const pass: Record<string, string> = {};
  for (const h of ['cookie', 'authorization']) { const v = req.headers.get(h); if (v) pass[h] = v; }
  // TASK_RELAY_TICKET (lib/tasks/relayTicket): this request already checked the session and the rate limit, so the
  // reads carry a signed pass for this one task and skip both. The session still rides along as the fallback.
  if (relayTicketEnabled()) {
    const ticket = mintRelayTicket({ userId: user.id, taskId: id, workersOpen: agentMediaOpenTo(user) }, Date.now(), (maxDuration + 30) * 1000);
    if (ticket) pass[RELAY_HEADER] = ticket;
  }
  const origin = req.nextUrl.origin;
  const read = async (a: number | undefined): Promise<TaskView | null> => {
    const url = `${origin}/api/tasks?id=${encodeURIComponent(id)}${a !== undefined ? `&after=${a}` : ''}`;
    const res = await fetch(url, { headers: pass, cache: 'no-store', signal: req.signal });
    const body = (await res.json().catch(() => null)) as { ok?: unknown; task?: unknown; error?: unknown; message?: unknown } | null;
    if (res.ok && body?.ok === true && body.task && typeof body.task === 'object') return body.task as TaskView;
    // The route's own "no such task of yours" (a 404 page of a deployment without it carries no message).
    if (res.status === 404 && body?.error === 'not_found' && typeof body.message === 'string') return null;
    throw new Error(`task read ${res.status}`);
  };

  const enc = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onAbort = () => { closed = true; };
      req.signal.addEventListener('abort', onAbort);
      try {
        await streamTask({
          read,
          sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
          now: () => Date.now(),
          closed: () => closed,
          write: (frame) => {
            if (closed) return false;
            try { controller.enqueue(enc.encode(frame)); return true; } catch { closed = true; return false; }
          },
        }, { lang: q.get('lang'), intervalMs: RELAY_INTERVAL_MS, ...(after !== undefined ? { after } : {}) });
      } finally {
        req.signal.removeEventListener('abort', onAbort);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
    cancel() { closed = true; },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'private, no-cache, no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
