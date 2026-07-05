/**
 * POST /api/admin/credits/adjust — admin credit increment/decrement BY EMAIL (v358 #2).
 * Body: { email: string, amount: number } (amount signed; negative decrements). isAdmin()-gated (email
 * allowlist; never user/app_metadata). Appends a constraint-valid `admin_adjustment` credit_ledger row via
 * the service-role client; a decrement that would drive the balance below zero is rejected, and |amount| is
 * capped at MAX_GRANT. The actor is stamped for audit.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createRouteHandlerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { adjustCreditsByEmail, MAX_GRANT } from '@/lib/admin/users';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

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

  const body = (await request.json().catch(() => ({}))) as { email?: unknown; amount?: unknown; amountGel?: unknown };
  const email = typeof body.email === 'string' ? body.email : '';
  const amount = Number(body.amount ?? body.amountGel);

  const result = await adjustCreditsByEmail(svc, email, amount, actorId);
  if (!result.ok) {
    const status = result.error === 'invalid_amount' ? 400 : result.error === 'user_not_found' ? 404 : result.error === 'insufficient_balance' ? 409 : 500;
    return NextResponse.json({ error: result.error ?? 'adjust_failed', maxGrant: MAX_GRANT, ...(result.newBalance !== null ? { balance: result.newBalance } : {}) }, { status });
  }
  return NextResponse.json({ ok: true, newBalance: result.newBalance });
}
