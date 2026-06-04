/**
 * POST /api/account/delete
 * =========================
 * Permanently deletes the CALLER'S OWN account.
 *
 * Apple App Store Guideline 5.1.1(v) requires any app that supports account
 * creation to also let users initiate account deletion from within the app —
 * this is the server side of that flow.
 *
 * Safety invariants:
 *  - The target user id comes ONLY from the authenticated session
 *    (`authedClientFromRequest`), never from the request body. A caller can
 *    therefore only ever delete their own account.
 *  - Deletion uses the service-role admin API to remove the `auth.users` row.
 *    Every user-owned table references `auth.users(id) ON DELETE CASCADE`
 *    (verified across the migrations), so the database removes all of the
 *    user's data — films, wallet, jobs, history, profiles — in one cascade.
 *    A few accounting rows use ON DELETE SET NULL and are intentionally
 *    retained de-identified for financial/legal records.
 *  - Rate-limited (WRITE bucket) and auth-gated; the client also requires an
 *    explicit type-to-confirm step before calling this.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (limited) return limited;

  // Identify the caller from their own session — cookie first, Bearer fallback.
  const { supabase, user } = await authedClientFromRequest(request);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  }

  try {
    const admin = createServiceRoleClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      return NextResponse.json({ ok: false, error: 'DELETE_FAILED' }, { status: 500 });
    }

    // Best-effort: clear the caller's session cookies so the browser is logged
    // out immediately. The auth row is already gone regardless, and the cookie
    // store can be read-only in some runtimes — so never let this throw.
    try {
      await supabase.auth.signOut();
    } catch {
      /* noop */
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: 'DELETE_FAILED' }, { status: 500 });
  }
}
