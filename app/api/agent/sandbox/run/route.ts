/**
 * /api/agent/sandbox/run — Agent G runs Python or JavaScript in an isolated Vercel Sandbox (lib/agent/sandbox/codeQuote).
 *
 *   GET                                       { enabled } for THIS user; never 404, so the chat asks first.
 *   POST { action: 'quote', request: { language, code } }
 *        checks the code against the sandbox policy with this server's limits (1 vCPU, 60 s, no network, no keys) and
 *        signs the plan → { ok, quote, request, token }. Nothing runs; free.
 *   POST { action: 'run', request, token }   the plan the user pressed Start on, once → { ok, exitCode, stdout, stderr,
 *        wallMs }. Synchronous: a run is at most 60 s.
 *
 * ⚠️ CLOSED UNLESS AGENT_G_SANDBOX OPENS IT (lib/agent/media/access agentSandboxAccess), and nothing runs unless
 * SANDBOX_ENABLED=1 too. A closed POST answers 404 before the session is read. Every run is booked in the shared $20
 * ledger before a sandbox exists (lib/agent/sandbox/runner), and a quote runs at most once (the duplicate guard fails
 * closed). The user's credits are not touched: a run is free for them.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentSandboxAccess, agentSandboxOpenTo } from '@/lib/agent/media/access';
import { quoteCodeRun, runCodeQuote, type CodeErrorCode } from '@/lib/agent/sandbox/codeQuote';
import { liveCodeDeps } from '@/lib/agent/sandbox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A run is at most 60 s inside the sandbox, plus creating and stopping it.
export const maxDuration = 120;

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });
const NO_STORE = { 'Cache-Control': 'private, no-store' };

const STATUS: Record<CodeErrorCode, number> = {
  bad_input: 400,
  not_configured: 503,
  quote_invalid: 400,
  quote_changed: 400,
  quote_expired: 409,
  quote_used: 409,
  guard_unavailable: 503,
  sandbox_disabled: 503,
  refused: 503,
  timeout: 422,
  cancelled: 408,
  runner_failed: 502,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  let enabled = false;
  if (agentSandboxAccess() !== 'off') {
    const { user } = await authedClientFromRequest(req);
    enabled = agentSandboxOpenTo(user);
  }
  return NextResponse.json({ enabled }, { headers: NO_STORE });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (agentSandboxAccess() === 'off') return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  if (!agentSandboxOpenTo(user)) return notFound();
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const deps = await liveCodeDeps();
  if (body?.action === 'quote') {
    const r = quoteCodeRun(deps, { userId: user.id, request: body.request });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.error], headers: NO_STORE });
  }
  if (body?.action === 'run') {
    const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.CODE_RUN_USER);
    if (capped) return capped;
    const r = await runCodeQuote(deps, { userId: user.id, request: body.request, token: body.token }, req.signal);
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.error], headers: NO_STORE });
  }
  return NextResponse.json({ ok: false, error: 'bad_input', message: "action: 'quote' or 'run'" }, { status: 400 });
}
