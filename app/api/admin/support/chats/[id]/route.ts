import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin, adminAllowlist } from '@/lib/auth/adminGuard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { getChatForAdmin, listMessages, markReadForAdmin, setChatStatus } from '@/lib/support/server';
import { reportError } from '@/lib/observability/report-error';

/**
 * One transcript.
 *   GET   → the chat + its messages, and marks it read for the admin side
 *   PATCH → { status } to park ('pending') or close a thread
 *
 * ⚠️ `[id]` IS AN ADMIN-SIDE PARAMETER AND THAT IS SAFE ONLY BECAUSE isAdmin() RUNS FIRST. An admin is
 * legitimately allowed to read any thread; nothing here may ever be reachable by a normal session.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The acting admin's email, for the audit trail. */
async function actorEmail(): Promise<string> {
  try {
    const sb = createSupabaseServerClient();
    const { data: { user } } = await sb.auth.getUser();
    const email = (user?.email ?? '').toLowerCase();
    return adminAllowlist().includes(email) ? email : 'unknown-admin';
  } catch {
    return 'unknown-admin';
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  try {
    const svc = createServiceRoleClient();
    const chat = await getChatForAdmin(svc, id);
    if (!chat) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const messages = await listMessages(svc, id);
    await markReadForAdmin(svc, id); // opening IS reading
    return NextResponse.json({ chat, messages });
  } catch (e) {
    reportError(e, { route: 'admin.support.chat.GET' });
    return NextResponse.json({ error: 'support_unavailable' }, { status: 503 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status;
  if (status !== 'open' && status !== 'pending' && status !== 'closed') {
    return NextResponse.json({ error: 'status must be open | pending | closed' }, { status: 400 });
  }

  try {
    await setChatStatus(createServiceRoleClient(), id, status, await actorEmail());
    return NextResponse.json({ ok: true, status });
  } catch (e) {
    reportError(e, { route: 'admin.support.chat.PATCH' });
    return NextResponse.json({ error: 'support_unavailable' }, { status: 503 });
  }
}
