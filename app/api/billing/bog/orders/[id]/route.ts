/**
 * GET /api/billing/bog/orders/[id] — "what happened to my payment?" for the customer who just came back from BOG.
 *
 * Owner-only (another user's order id → 404). A still-pending order is reconciled on the spot against BOG's receipt
 * (GET /receipt) through the same idempotent settlement the callback uses, so the credits land even when the callback
 * is late or lost — the customer is looking at the screen right now, and BOG does not retry callbacks.
 *
 * → { orderId, kind, status: completed | pending | failed | refunded | review, credits, tier, periodEnd, autoRenew }
 *   `review` = paid but the amount did not match the order; nothing was credited and it needs a human.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { bogConfig } from '@/lib/billing/bogClient';
import { isBogOrderId, loadBogOrder, reconcileBogOrder, type BogOrderRow } from '@/lib/billing/bogSettlement';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATUS_USER_LIMIT: Parameters<typeof checkRateLimitByKey>[1] = {
  maxRequests: 120,
  windowMs: 60 * 60_000,
  keyPrefix: 'rl:bog:status:user',
};

type PublicStatus = 'completed' | 'pending' | 'failed' | 'refunded' | 'review';

function publicStatus(s: string): PublicStatus {
  if (s === 'completed') return 'completed';
  if (s === 'pending') return 'pending';
  if (s === 'refunded') return 'refunded';
  if (s === 'amount_mismatch') return 'review';
  return 'failed'; // rejected, expired, init_failed
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  let userId: string;
  try {
    userId = (await requireAuthenticatedUser(request)).id;
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const limited = await checkRateLimitByKey(userId, STATUS_USER_LIMIT);
  if (limited) return limited;

  const id = params?.id;
  if (!isBogOrderId(id)) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 503 });
  }

  let order: BogOrderRow | null = await loadBogOrder(svc, { shopOrderId: id });
  if (!order || order.user_id !== userId) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const cfg = bogConfig();
  if (order.status === 'pending' && cfg && order.bog_order_id) {
    const outcome = await reconcileBogOrder(svc, cfg, { fetch }, order);
    if (outcome.status !== 'pending' && outcome.status !== 'error') {
      order = (await loadBogOrder(svc, { shopOrderId: id })) ?? order;
    }
  }

  let autoRenew: boolean | null = null;
  if (order.kind !== 'topup' && order.subscription_id && order.status === 'completed') {
    const { data } = await svc
      .from('subscriptions')
      .select('cancel_at_period_end,bog_parent_order_id')
      .eq('id', order.subscription_id)
      .maybeSingle();
    const sub = data as { cancel_at_period_end?: boolean; bog_parent_order_id?: string | null } | null;
    if (sub) autoRenew = !sub.cancel_at_period_end && Boolean(sub.bog_parent_order_id);
  }

  return NextResponse.json(
    {
      orderId: order.shop_order_id,
      kind: order.kind,
      status: publicStatus(order.status),
      credits: order.kind === 'topup' ? Math.floor(Number(order.amount_gel) * 10) : (order.credits ?? 0),
      tier: order.tier,
      periodEnd: order.period_end ?? null,
      autoRenew,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
