import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { getDailyUsage, checkThresholds, currentMode } from '@/lib/services/billing/BillingGuard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/usage/daily — Master Task §4.6.
 *
 * Today's PLATFORM provider spend against the $10/day envelope, plus the active §1.8 budget mode and any
 * open alerts. This is the feed for the cost-monitoring dashboard.
 *
 * ADMIN ONLY, deliberately: this is the platform's own P&L (what our API calls cost us), not the caller's
 * credit balance. A customer's usage lives behind /api/credits/balance. Exposing aggregate provider spend to
 * end users would leak our margin structure. Gate is the same server-side allowlist the founder telemetry
 * uses — never a client-settable field.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const gate = assertAdminAccess(request, user ?? null);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });
    }

    const [usage, alerts, mode] = await Promise.all([getDailyUsage(), checkThresholds(), currentMode()]);
    return NextResponse.json({
      window: 'daily',
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
