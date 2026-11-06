/**
 * /api/agent/browser/run — Agent G opens public web pages in a throwaway sandboxed Chromium (lib/agent/browser).
 *
 *   GET                                         { enabled } for THIS user; never 404, so the chat asks first.
 *   POST { action: 'quote', request: { steps } } checks the steps (public http(s) sites only, ≤ 20 steps, ≤ 5
 *        screenshots) and signs the plan for the caller's own Agent G workspace (the server picks it, never the body)
 *        → { ok, quote, request, token }. Nothing runs; free.
 *   POST { action: 'run', request, token }      the plan the user pressed Start on, once → { ok, steps, finalUrl,
 *        wallMs, workspace }. Screenshots and texts are saved in the workspace under browser/<task>/.
 *
 * ⚠️ CLOSED UNLESS AGENT_G_SANDBOX OPENS IT (the same admins-first gate as code runs), and nothing runs unless
 * BROWSER_ENABLED=1 and BROWSER_SNAPSHOT_ID are set. A closed POST answers 404 before the session is read. Every task is
 * booked in the shared $20 sandbox ledger before a sandbox exists; a quote runs at most once (the guard fails closed).
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentSandboxAccess, agentSandboxOpenTo } from '@/lib/agent/media/access';
import { quoteBrowserTask, runBrowserQuote, type BrowserErrorCode } from '@/lib/agent/browser/quote';
import { browserEnabled, liveBrowserDeps } from '@/lib/agent/browser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A task is at most 120 s of steps plus 30 s to start Chromium, plus creating and stopping the sandbox.
export const maxDuration = 240;

const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });
const NO_STORE = { 'Cache-Control': 'private, no-store' };

const STATUS: Record<BrowserErrorCode, number> = {
  bad_input: 400,
  not_configured: 503,
  quote_invalid: 400,
  quote_changed: 400,
  quote_expired: 409,
  quote_used: 409,
  guard_unavailable: 503,
  browser_disabled: 503,
  refused: 503,
  timeout: 422,
  cancelled: 408,
  runner_failed: 502,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  let enabled = false;
  if (agentSandboxAccess() !== 'off' && browserEnabled()) {
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
  const limited = await checkRateLimit(req, RATE_LIMITS.BROWSER_RUN_BURST, user.id);
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const deps = await liveBrowserDeps();
  if (body?.action === 'quote') {
    const asked = body.request && typeof body.request === 'object' ? (body.request as Record<string, unknown>) : {};
    // Only ever the caller's own workspace: the id comes from their uid here, never from the body.
    const { liveWorkspaceStore, AGENT_WORKSPACE_TITLE } = await import('@/lib/agent/workspace/live');
    const w = await liveWorkspaceStore().ensure(user.id, AGENT_WORKSPACE_TITLE);
    if (!w.ok) return NextResponse.json({ ok: false, error: 'runner_failed', message: w.message }, { status: 503, headers: NO_STORE });
    const r = quoteBrowserTask(deps, { userId: user.id, request: { steps: asked.steps, workspaceId: w.workspace.id } });
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.error], headers: NO_STORE });
  }
  if (body?.action === 'run') {
    const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.BROWSER_RUN_USER);
    if (capped) return capped;
    const r = await runBrowserQuote(deps, { userId: user.id, request: body.request, token: body.token }, req.signal);
    return NextResponse.json(r, { status: r.ok ? 200 : STATUS[r.error], headers: NO_STORE });
  }
  return NextResponse.json({ ok: false, error: 'bad_input', message: "action: 'quote' or 'run'" }, { status: 400 });
}
