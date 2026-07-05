/**
 * POST /api/admin/credits/grant — admin-only manual credit grant.
 * Body: { userId: string, amountGel: number }. Gated by isAdmin() = the EMAIL ALLOWLIST only
 * (founder ∪ ADMIN_EMAILS); user_metadata is never trusted for authz. Appends a constraint-valid
 * `admin_adjustment` credit_ledger row (the balance trigger applies the delta). Amount is validated +
 * capped server-side (MAX_GRANT); the target must exist. Replaces the manual SQL grant.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createRouteHandlerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { grantCredits, MAX_GRANT } from '@/lib/admin/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // The admin performing the grant — recorded in the ledger metadata for audit.
  let actorId = 'admin';
  try {
    const { data: { user } } = await createRouteHandlerClient().auth.getUser();
    if (user?.id) actorId = user.id;
  } catch {
    /* keep default label */
  }

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }

  const body = (await request.json().catch(() => ({}))) as { userId?: unknown; amountGel?: unknown; amount?: unknown };
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const amount = Number(body.amountGel ?? body.amount);

  const result = await grantCredits(svc, userId, amount, actorId);
  if (!result.ok) {
    const status = result.error === 'invalid_amount' ? 400 : result.error === 'user_not_found' ? 404 : 500;
    return NextResponse.json({ error: result.error ?? 'grant_failed', maxGrant: MAX_GRANT }, { status });
  }
  return NextResponse.json({ ok: true, newBalance: result.newBalance });
}
