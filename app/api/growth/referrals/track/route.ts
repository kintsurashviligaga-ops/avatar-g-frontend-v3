import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  code: z.string().min(4),
});

export async function POST(request: NextRequest) {
  const body = BodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: body.error.flatten() }, { status: 400 });
  }

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminSupabase = createServiceRoleClient();
  const { data: referral } = await adminSupabase
    .from('referral_codes')
    .select('user_id, code')
    .eq('code', body.data.code)
    .maybeSingle();

  if (!referral || referral.user_id === user.id) {
    return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
  }

  const { data: sub } = await adminSupabase
    .from('subscriptions')
    .select('plan,status')
    .eq('user_id', referral.user_id)
    .maybeSingle();

  const isPaid = Boolean(sub && sub.plan !== 'FREE' && ['active', 'trialing'].includes(String(sub.status)));
  const rewardType = isPaid ? 'discount_month' : 'bonus_credits';
  const rewardUnits = isPaid ? 1 : 200;

  await adminSupabase.from('referral_events').insert({
    referrer_user_id: referral.user_id,
    referred_user_id: user.id,
    code: referral.code,
    reward_type: rewardType,
    reward_units: rewardUnits,
    metadata: { source: 'signup' },
  });

  await adminSupabase.from('events').insert({
    type: 'referral_reward_pending',
    user_id: referral.user_id,
    metadata: {
      referred_user_id: user.id,
      reward_type: rewardType,
      reward_units: rewardUnits,
    },
  });

  return NextResponse.json({
    ok: true,
    reward_type: rewardType,
    reward_units: rewardUnits,
  });
}
