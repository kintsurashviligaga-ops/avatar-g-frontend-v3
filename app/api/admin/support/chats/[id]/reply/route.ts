import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdmin, adminAllowlist } from '@/lib/auth/adminGuard';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { normalizeSupportBody } from '@/lib/support/sanitize';
import { appendMessage, getChatForAdmin, markReadForAdmin } from '@/lib/support/server';
import { reportError } from '@/lib/observability/report-error';

/**
 * ⚠️ THE ONLY WRITER OF `sender = 'admin'` IN THE ENTIRE PRODUCT. If a second one is ever added, the
 * "message from support" badge stops meaning anything — a user has no way to tell an impersonated reply
 * from a real one, and support replies are exactly where someone would be told to click a link or share
 * a code. Keep this the single door, behind the email allowlist.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const { id } = await ctx.params;
  if (!UUID.test(id)) return NextResponse.json({ error: 'bad_id' }, { status: 400 });

  const raw = await req.json().catch(() => ({}));
  const body = normalizeSupportBody((raw as { body?: unknown })?.body);
  if (!body) return NextResponse.json({ error: 'empty_message' }, { status: 400 });

  // Attributed: an unattributed admin message in someone's support thread is unauditable, and this is
  // the same gap that was called out on the credit-adjustment route.
  let email = 'unknown-admin';
  try {
    const { data: { user } } = await createSupabaseServerClient().auth.getUser();
    const e = (user?.email ?? '').toLowerCase();
    if (adminAllowlist().includes(e)) email = e;
  } catch { /* keep the fallback */ }

  try {
    const svc = createServiceRoleClient();
    const chat = await getChatForAdmin(svc, id);
    if (!chat) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    const message = await appendMessage(svc, id, 'admin', body, { email });
    await markReadForAdmin(svc, id); // replying IS reading
    return NextResponse.json({ message });
  } catch (e) {
    reportError(e, { route: 'admin.support.reply' });
    return NextResponse.json({ error: 'support_unavailable' }, { status: 503 });
  }
}
