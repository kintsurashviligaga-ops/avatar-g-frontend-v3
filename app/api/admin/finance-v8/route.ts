import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { financeDashboardOn } from '@/lib/billing/margin/flags';
import { loadFinanceReport, type ReadClient } from '@/lib/billing/margin/report';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/finance-v8?days=30 — the Phase 8.1 founder dashboard: revenue (BOG), Google cost (estimated from
 * provider_costs, reconciled from reconcile_reports), net profit and margin, top credit burners, margin per model and
 * margin alerts. Read-only. 404 while ADMIN_FINANCE_DASHBOARD is off; 401/403 for anyone who is not an admin (same
 * server-side gate as /api/admin/financials). Aggregates need the service-role client because the ledgers are RLS'd.
 */
export async function GET(request: NextRequest) {
  if (!financeDashboardOn()) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const gate = await assertAdminAccess(request, user ?? null);
    if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });

    const daysParam = Number(new URL(request.url).searchParams.get('days'));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(365, Math.floor(daysParam)) : 30;
    const report = await loadFinanceReport(createServiceRoleClient() as unknown as ReadClient, days);
    return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[GET /api/admin/finance-v8]', error);
    return NextResponse.json({ error: 'Failed to build the finance report' }, { status: 500 });
  }
}
