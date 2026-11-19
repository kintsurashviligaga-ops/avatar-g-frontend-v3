/**
 * /api/agent/workspace — the user's Execution Workspaces (lib/agent/workspace; GG's 2026-11-06 audit, ACTION 2).
 *
 *   GET                         { enabled } for THIS user; never 404, so the UI asks first.
 *   POST { action, ... }        lib/agent/workspace/actions: list, create, files, read, write, delete, restore,
 *                               history, link, export, render_pdf, premiere_xml, task_plan, task_read. The user id is the session's,
 *                               never the body's.
 *
 * Every file lives in a PRIVATE bucket under the user's own id; a write or delete is a new version, so nothing the user
 * had is lost. Opened with the code sandbox (AGENT_G_SANDBOX), because a workspace is what a code run reads and writes.
 * Nothing here costs money: storage only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { agentSandboxAccess, agentSandboxOpenTo } from '@/lib/agent/media/access';
import { workspaceAction } from '@/lib/agent/workspace/actions';
import { liveExportDeps, liveWorkspaceStore } from '@/lib/agent/workspace/live';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** render_pdf draws up to ~30 pages in the function. */
export const maxDuration = 60;

const NO_STORE = { 'Cache-Control': 'private, no-store' };
const notFound = () => NextResponse.json({ error: 'not_found' }, { status: 404 });

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
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: 'bad_input', message: 'A JSON body is needed.' }, { status: 400 });
  const readOnly = body.action === 'list' || body.action === 'files' || body.action === 'read' || body.action === 'history' || body.action === 'task_read';
  const limited = await checkRateLimit(req, readOnly ? RATE_LIMITS.READ : RATE_LIMITS.WRITE, user.id);
  if (limited) return limited;
  const r = await workspaceAction(liveWorkspaceStore(), liveExportDeps(), user.id, body, 'user');
  return NextResponse.json(r.body, { status: r.status, headers: NO_STORE });
}
