import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { getMonthlyUsage, checkThresholds, currentMode } from '@/lib/services/billing/BillingGuard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/usage/monthly — Master Task §4.6.
 *
 * Calendar-month PLATFORM provider spend against the $300 envelope, the active §1.8 budget mode and open
 * alerts. Admin-only for the same reason as the daily endpoint: this is our cost base, not the user's.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const gate = assertAdminAccess(request, user ?? null);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });
    }

    const [usage, alerts, mode] = await Promise.all([getMonthlyUsage(), checkThresholds(), currentMode()]);
    return NextResponse.json({
      window: 'monthly',
      used: usage.used,
      limit: usage.limit,
      percent: usage.percent,
      currency: 'USD',
      mode,
      alerts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'usage_unavailable', message: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
