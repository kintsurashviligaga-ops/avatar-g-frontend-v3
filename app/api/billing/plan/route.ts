import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getPlanDefinition, normalizePlanId } from '@/lib/monetization/plans';
import { cacheGet, cacheSet } from '@/lib/platform/cache';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error_code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
      { status: 401 }
    );
  }

  const cacheKey = `billing-plan:${user.id}`;
  const cached = await cacheGet<{
    user_id: string;
    plan: string;
    status: string;
    current_period_end: string | null;
    entitlements: unknown;
    credits: { balance: number; monthly_allowance: number; reset_at: string | null };
  }>(cacheKey);

  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  const [{ data: subscription }, { data: credits }] = await Promise.all([
    supabase.from('subscriptions').select('plan,status,current_period_end').eq('user_id', user.id).maybeSingle(),
    supabase.from('credits').select('balance,monthly_allowance,reset_at').eq('user_id', user.id).maybeSingle(),
  ]);

  const planId = normalizePlanId(subscription?.plan ?? 'FREE');
  const entitlements = getPlanDefinition(planId);

  const payload = {
    user_id: user.id,
    plan: planId,
    status: subscription?.status ?? 'active',
    current_period_end: subscription?.current_period_end ?? null,
    entitlements,
    credits: {
      balance: Number(credits?.balance ?? 0),
      monthly_allowance: Number(credits?.monthly_allowance ?? 0),
      reset_at: credits?.reset_at ?? null,
    },
  };

  await cacheSet(cacheKey, payload, 60);

  return NextResponse.json({ ...payload, cached: false });
}
