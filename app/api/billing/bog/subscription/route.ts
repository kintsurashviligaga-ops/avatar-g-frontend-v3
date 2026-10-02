/**
 * /api/billing/bog/subscription — the signed-in user's Bank of Georgia plan.
 *
 *   GET    → { plan: { tier, status, currentPeriodEnd, autoRenew, cardMask, amountGel } | null }
 *            the highest live plan (period not ended); `autoRenew` = BOG holds a card for it and it is not cancelled
 *   DELETE → stop auto-renewal: the plan stays active until currentPeriodEnd, nothing is charged again, and the saved
 *            card is deleted at BOG (best effort — the cron also refuses a cancelled plan, so a failed delete cannot
 *            cause a charge).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { bogConfig, deleteSavedCard } from '@/lib/billing/bogClient';
import { TIERS, isPaidTierId } from '@/lib/billing/tiers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface SubRow {
  tier: string | null;
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  bog_parent_order_id: string | null;
  card_mask: string | null;
  amount_gel: number | string | null;
}

async function context(request: NextRequest) {
  const userId = (await requireAuthenticatedUser(request)).id;
  return { userId, svc: createServiceRoleClient() };
}

export async function GET(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof context>>;
  try {
    ctx = await context(request);
  } catch (e) {
    const unauth = e instanceof Error && e.message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauth ? 'Unauthorized' : 'server_misconfigured' }, { status: unauth ? 401 : 503 });
  }
  const { data, error } = await ctx.svc
    .from('subscriptions')
    .select('tier,status,current_period_end,cancel_at_period_end,bog_parent_order_id,card_mask,amount_gel')
    .eq('user_id', ctx.userId)
    .eq('provider', 'bog')
    .in('status', ['active', 'past_due'])
    .gt('current_period_end', new Date().toISOString())
    .limit(10);
  if (error) return NextResponse.json({ plan: null }, { headers: { 'Cache-Control': 'no-store' } });

  const live = ((data ?? []) as SubRow[]).filter((r) => isPaidTierId(r.tier));
  live.sort((a, b) => TIERS[b.tier as keyof typeof TIERS].rank - TIERS[a.tier as keyof typeof TIERS].rank);
  const top = live[0];
  return NextResponse.json(
    {
      plan: top
        ? {
            tier: top.tier,
            status: top.status,
            currentPeriodEnd: top.current_period_end,
            autoRenew: !top.cancel_at_period_end && Boolean(top.bog_parent_order_id),
            cardMask: top.card_mask,
            amountGel: top.amount_gel === null ? null : Number(top.amount_gel),
          }
        : null,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function DELETE(request: NextRequest) {
  let ctx: Awaited<ReturnType<typeof context>>;
  try {
    ctx = await context(request);
  } catch (e) {
    const unauth = e instanceof Error && e.message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauth ? 'Unauthorized' : 'server_misconfigured' }, { status: unauth ? 401 : 503 });
  }
  const limited = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (limited) return limited;

  const { data, error } = await ctx.svc
    .from('subscriptions')
    .update({ cancel_at_period_end: true, canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', ctx.userId)
    .eq('provider', 'bog')
    .in('status', ['active', 'past_due'])
    .eq('cancel_at_period_end', false)
    .select('bog_parent_order_id');
  if (error) return NextResponse.json({ error: 'cancel_failed' }, { status: 503 });

  const cards = ((data ?? []) as Array<{ bog_parent_order_id: string | null }>)
    .map((r) => r.bog_parent_order_id)
    .filter((x): x is string => Boolean(x));
  const cfg = bogConfig();
  if (cfg && cards.length) {
    await Promise.allSettled(cards.map((id) => deleteSavedCard(cfg, { fetch }, id)));
  }
  return NextResponse.json({ canceled: (data ?? []).length });
}
