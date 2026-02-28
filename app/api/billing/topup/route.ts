import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import { CREDIT_PACKS } from '@/lib/billing/pricingConfig';
import type { CreditPackId, TopupResponse } from '@/types/billing';

export const dynamic = 'force-dynamic';

const TopupSchema = z.object({
  packId: z.enum(['starter', 'pro', 'agency'] as const),
});

/**
 * POST /api/billing/topup
 * Add credits from a purchased credit pack.
 * Body: { packId: 'starter' | 'pro' | 'agency' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = TopupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_pack', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const packId = parsed.data.packId as CreditPackId;
    const pack = CREDIT_PACKS.find((p) => p.id === packId);

    if (!pack) {
      return NextResponse.json({ error: 'pack_not_found' }, { status: 404 });
    }

    const admin = createServiceRoleClient();

    // Ensure user_credits row exists
    const { data: existing } = await admin
      .from('user_credits')
      .select('balance')
      .eq('user_id', user.id)
      .single();

    if (!existing) {
      await admin
        .from('user_credits')
        .insert({ user_id: user.id, plan_id: 'trial', balance: 0 });
    }

    const currentBalance = (existing?.balance as number) ?? 0;
    const newBalance = currentBalance + pack.credits;

    // Update balance
    await admin
      .from('user_credits')
      .update({ balance: newBalance })
      .eq('user_id', user.id);

    // Insert ledger entry
    await admin.from('credits_ledger').insert({
      user_id: user.id,
      delta: pack.credits,
      reason: `topup:${packId}`,
      meta: { pack_id: packId, price_usd: pack.priceUsd },
    });

    structuredLog('info', 'credits.topup', {
      userId: user.id,
      packId,
      credits: pack.credits,
      newBalance,
    });

    const resp: TopupResponse = { balance: newBalance };
    return NextResponse.json(resp);
  } catch (err) {
    structuredLog('error', 'credits.topup.error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
