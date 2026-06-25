/**
 * POST /api/credits/record — append one row to the credit_transactions feed.
 *
 * Called best-effort by the client right after a successful generation (and on
 * top-ups). The real money lives in the GEL wallet; this is just the
 * credit-denominated activity feed shown in Settings → History. STRICTLY
 * fail-open: no session, no table, or any error → 200 { ok:false } and the
 * generation is entirely unaffected.
 *
 * Request: { action: string, creditsDelta: number }   Response: { ok }
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.WRITE);
  if (rl) return rl;

  try {
    const { user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ ok: false }); // anonymous → nothing to record

    const body = (await req.json().catch(() => ({}))) as { action?: unknown; creditsDelta?: unknown };
    const action = typeof body.action === 'string' ? body.action.trim().slice(0, 40) : '';
    const creditsDelta = Number(body.creditsDelta);
    if (!action || !Number.isFinite(creditsDelta) || creditsDelta === 0) return NextResponse.json({ ok: false });

    const admin = createServiceRoleClient();
    const { error } = await admin.from('credit_transactions').insert({
      user_id: user.id,
      action,
      credits_delta: Math.trunc(creditsDelta),
    });
    return NextResponse.json({ ok: !error });
  } catch {
    return NextResponse.json({ ok: false }); // fail-open
  }
}
