/**
 * GET /api/rate-limit/daily
 * Returns today's generation count and daily limit for the authenticated user.
 * Starter/FREE plan → 50 gen/day limit; paid plans → unlimited.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getDailyLimit } from '@/lib/pricing/canonicalPricing';

export const dynamic = 'force-dynamic';

/** Map legacy plan IDs to canonicalPricing plan IDs */
function mapPlanToPricingId(rawPlan: string | null | undefined): string {
  const p = (rawPlan ?? 'FREE').toUpperCase();
  if (p === 'FREE' || p === 'STARTER') return 'starter';
  if (p === 'BASIC' || p === 'PRO') return 'pro';
  if (p === 'PREMIUM' || p === 'ULTIMATE') return 'ultimate';
  if (p === 'ENTERPRISE' || p === 'AGENT_G_FULL') return 'enterprise';
  return 'starter'; // default: most restrictive
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    // Get user's current plan
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle();

    const pricingPlanId = mapPlanToPricingId(subscription?.plan);
    const dailyLimit = getDailyLimit(pricingPlanId); // 0 = unlimited

    // Count today's generations from user_creations
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from('user_creations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', todayStart.toISOString());

    if (error) {
      // Table may not exist yet — return unlimited gracefully
      console.warn('user_creations count error (non-fatal):', error.message);
      return NextResponse.json({
        count: 0,
        limit: dailyLimit,
        remaining: dailyLimit === 0 ? null : dailyLimit,
        unlimited: dailyLimit === 0,
        planId: pricingPlanId,
        isAtLimit: false,
        isNearLimit: false,
      });
    }

    const todayCount = count ?? 0;
    const remaining = dailyLimit === 0 ? null : Math.max(0, dailyLimit - todayCount);
    const isAtLimit = dailyLimit > 0 && todayCount >= dailyLimit;
    // "Near limit" = used ≥ 80% of daily allowance
    const isNearLimit = dailyLimit > 0 && !isAtLimit && todayCount >= dailyLimit * 0.8;

    return NextResponse.json({
      count: todayCount,
      limit: dailyLimit,
      remaining,
      unlimited: dailyLimit === 0,
      planId: pricingPlanId,
      isAtLimit,
      isNearLimit,
    });
  } catch (err) {
    console.error('Rate limit daily check error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
