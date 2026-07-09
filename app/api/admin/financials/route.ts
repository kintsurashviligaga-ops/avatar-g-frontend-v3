import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { computeFinancials } from '@/lib/financials/adminMetrics';
import { BANK_FEE_RATE } from '@/lib/financials/constants';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/financials?days=30
 *
 * Founder financial telemetry: Gross Revenue, 2.5% Bank Fees, real-time raw API costs, and Net Margin over a
 * rolling window. Aggregated live from the ledgers (wallet_topups for revenue, agent_evolution_traces for
 * per-render provider spend) rather than a pre-baked snapshot.
 *
 * Locked strictly behind SERVER-SIDE admin validation: the caller's session user must pass assertAdminAccess
 * (email allowlist ∪ app_metadata role — app_metadata is service-role-only, never client-writable). We
 * DELIBERATELY do not trust user_metadata or any client-settable field. Aggregate reads use the service-role
 * client (the ledgers are RLS'd per-user; an admin's own session could only see their own rows).
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    const gate = assertAdminAccess(request, user ?? null);
    if (!gate.ok) {
      // 401 when unauthenticated, 403 when signed-in-but-not-admin.
      return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });
    }

    // Rolling window (default 30d, clamped to 1..365).
    const daysParam = Number(new URL(request.url).searchParams.get('days'));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(365, Math.floor(daysParam)) : 30;
    const until = new Date();
    const since = new Date(until.getTime() - days * 86_400_000);
    const sinceIso = since.toISOString();

    const admin = createServiceRoleClient();
    // Fail-open per source: a missing table/column (unapplied migration) degrades a field to 0 rather than
    // 500-ing the whole dashboard — the response flags which sources were unavailable.
    const degraded: string[] = [];

    const topupsRes = await admin.from('wallet_topups').select('amount_gel').gte('created_at', sinceIso);
    if (topupsRes.error) degraded.push('wallet_topups');
    const topups = topupsRes.data ?? [];

    const tracesRes = await admin
      .from('agent_evolution_traces')
      .select('cost_wholesale_gel, cost_retail_gel, worker_kind, status')
      .gte('created_at', sinceIso);
    if (tracesRes.error) degraded.push('agent_evolution_traces');
    const traces = tracesRes.data ?? [];

    const summary = computeFinancials({ topups, traces, bankFeeRate: BANK_FEE_RATE });

    return NextResponse.json({
      currency: 'GEL',
      window: { days, since: sinceIso, until: until.toISOString() },
      ...summary,
      ...(degraded.length ? { degraded } : {}),
    });
  } catch (error) {
    console.error('[GET /api/admin/financials]', error);
    return NextResponse.json({ error: 'Failed to compute financials' }, { status: 500 });
  }
}
