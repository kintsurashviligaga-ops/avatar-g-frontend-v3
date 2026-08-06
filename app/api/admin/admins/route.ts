import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdmin, adminAllowlist, invalidateAdminAllowlist } from '@/lib/auth/adminGuard';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { reportError } from '@/lib/observability/report-error';

/**
 * Grant / revoke admin-panel access by email.
 *   GET    → the current list (panel-granted rows + the built-in ones, marked)
 *   POST   → { email, note? } grant
 *   DELETE → ?email=… revoke
 *
 * ⚠️ ONLY AN EXISTING ADMIN MAY CALL THIS, and the gate is the same isAdmin() email allowlist used
 * everywhere else — never user_metadata, which is self-grantable and would let any signed-up account
 * make itself an admin.
 *
 * ⚠️ THE BUILT-IN ADMINS CANNOT BE REVOKED HERE. They come from code + env, not this table, so a DELETE
 * naming one would appear to succeed (0 rows) while changing nothing — the panel would show a control
 * that lies. It is refused explicitly instead. That also means this endpoint can never lock the founder
 * out of their own product, no matter what is sent to it.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function actorEmail(): Promise<string> {
  try {
    const { data: { user } } = await createSupabaseServerClient().auth.getUser();
    return (user?.email ?? '').toLowerCase() || 'unknown-admin';
  } catch { return 'unknown-admin'; }
}

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;

  const builtIn = adminAllowlist();
  try {
    const { data } = await createServiceRoleClient()
      .from('admin_emails').select('email, added_by, note, created_at').order('created_at', { ascending: true });
    return NextResponse.json({
      builtIn,                       // from code + env — shown so the panel can mark them un-revocable
      granted: data ?? [],
    });
  } catch (e) {
    reportError(e, { route: 'admin.admins.GET' });
    // The table may not exist yet (migration is applied by hand). The built-ins still work, so say so
    // rather than 500 — an admin locked out of the admins page cannot fix the admins page.
    return NextResponse.json({ builtIn, granted: [], degraded: true });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as { email?: unknown; note?: unknown };
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : null;

  try {
    const { error } = await createServiceRoleClient()
      .from('admin_emails')
      .upsert({ email, added_by: await actorEmail(), ...(note ? { note } : {}) }, { onConflict: 'email' });
    if (error) throw error;
    invalidateAdminAllowlist(); // effective immediately, not in 30s
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    reportError(e, { route: 'admin.admins.POST' });
    return NextResponse.json({ error: 'grant_failed', message: 'Run migration 20260802e_admin_emails.sql' }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const email = String(req.nextUrl.searchParams.get('email') ?? '').trim().toLowerCase();
  if (!EMAIL.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  // ⚠️ Refused, not silently ignored — see the header. A built-in admin lives in code/env; deleting a row
  // that does not exist would report success while the person kept full access.
  if (adminAllowlist().includes(email)) {
    return NextResponse.json(
      { error: 'built_in_admin', message: 'This admin comes from code/env and cannot be revoked from the panel.' },
      { status: 409 },
    );
  }

  try {
    const { error } = await createServiceRoleClient().from('admin_emails').delete().eq('email', email);
    if (error) throw error;
    invalidateAdminAllowlist();
    return NextResponse.json({ ok: true, email });
  } catch (e) {
    reportError(e, { route: 'admin.admins.DELETE' });
    return NextResponse.json({ error: 'revoke_failed' }, { status: 503 });
  }
}
