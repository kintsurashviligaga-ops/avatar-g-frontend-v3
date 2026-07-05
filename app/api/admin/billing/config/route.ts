/**
 * /api/admin/billing/config — the pricing configurator store (v358 #2).
 *   GET  → the configured/effective refill tiers (+ whether the hardcoded defaults are in effect) + the
 *          metric-only commission rules.
 *   POST → { kind: 'tier', gelAmount, creditsAmount?, label?, isActive? } upsert a purchasable tier, OR
 *          { kind: 'commission', gateway, commissionPercent, note? } upsert a metric-only commission rule.
 * isAdmin()-gated (email allowlist; never user/app_metadata). Commission is DISPLAY/REPORTING only — no
 * webhook ever deducts it (product decision); a paid top-up is always credited in full.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { getTierConfig, getCommissionRules, upsertTier, upsertCommission } from '@/lib/billing/pricingConfig.db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function actor(): Promise<string | null> {
  try {
    const { data: { user } } = await createRouteHandlerClient().auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const [tiers, commission] = await Promise.all([getTierConfig(), getCommissionRules()]);
  return NextResponse.json({ ok: true, tiers, commission });
}

export async function POST(request: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  const actorId = await actor();

  if (kind === 'tier') {
    const result = await upsertTier(
      {
        gelAmount: Number(body.gelAmount),
        ...(body.creditsAmount !== undefined ? { creditsAmount: Number(body.creditsAmount) } : {}),
        label: typeof body.label === 'string' ? body.label : null,
        ...(typeof body.isActive === 'boolean' ? { isActive: body.isActive } : {}),
      },
      actorId,
    );
    if (!result.ok) {
      const status = result.error === 'invalid_amount' || result.error === 'invalid_credits' ? 400 : 500;
      return NextResponse.json({ error: result.error ?? 'write_failed' }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  if (kind === 'commission') {
    if (body.gateway !== 'stripe' && body.gateway !== 'bog') return NextResponse.json({ error: 'invalid_gateway' }, { status: 400 });
    const result = await upsertCommission(
      { gateway: body.gateway, commissionPercent: Number(body.commissionPercent), note: typeof body.note === 'string' ? body.note : null },
      actorId,
    );
    if (!result.ok) {
      const status = result.error === 'invalid_percent' || result.error === 'invalid_gateway' ? 400 : 500;
      return NextResponse.json({ error: result.error ?? 'write_failed' }, { status });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'invalid_kind' }, { status: 400 });
}
