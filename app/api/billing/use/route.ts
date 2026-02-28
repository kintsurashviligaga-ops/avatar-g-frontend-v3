import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import { CREDIT_COSTS } from '@/lib/billing/pricingConfig';
import type { CreditOperation } from '@/types/billing';

export const dynamic = 'force-dynamic';

const UseSchema = z.object({
  operation: z.enum([
    'profit_calc',
    'product_analysis',
    'business_plan',
    'listing_pack',
    'resell_pipeline',
    'promo_video',
    'executive_task_base',
  ] as const),
  meta: z.record(z.unknown()).optional(),
});

/**
 * POST /api/billing/use
 * Deduct credits for a specified operation.
 * Body: { operation: CreditOperation, meta?: Record<string, unknown> }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = UseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'invalid_operation', details: parsed.error.flatten() },
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

    const op = parsed.data.operation as CreditOperation;
    const cost = CREDIT_COSTS[op];
    const admin = createServiceRoleClient();

    // Fetch current balance
    const { data: credits } = await admin
      .from('user_credits')
      .select('balance, plan_id')
      .eq('user_id', user.id)
      .single();

    if (!credits) {
      return NextResponse.json({ error: 'no_credits_row' }, { status: 404 });
    }

    const balance = credits.balance as number;

    if (balance < cost) {
      return NextResponse.json(
        { error: 'insufficient_credits', required: cost, balance },
        { status: 402 },
      );
    }

    const newBalance = balance - cost;

    // Deduct
    await admin
      .from('user_credits')
      .update({ balance: newBalance })
      .eq('user_id', user.id);

    // Ledger
    await admin.from('credits_ledger').insert({
      user_id: user.id,
      delta: -cost,
      reason: `use:${op}`,
      meta: parsed.data.meta ?? {},
    });

    structuredLog('info', 'credits.use', {
      userId: user.id,
      operation: op,
      cost,
      newBalance,
    });

    return NextResponse.json({ balance: newBalance, deducted: cost });
  } catch (err) {
    structuredLog('error', 'credits.use.error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
