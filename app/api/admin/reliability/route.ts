/**
 * GET /api/admin/reliability — the unified reliability/observability snapshot (admin-only).
 *
 * ONE call → the truth: which provider keys are live in THIS deployment, per-service success rates,
 * real render timings, and the most recent failures — over a rolling window (?days=1..90, default 7).
 * This is the "measure first" panel so product decisions rest on facts, not feelings. Purely a READ +
 * a pure aggregation; strictly fail-open (an unmigrated generation_jobs table degrades to zeros, never
 * a 500) and admin-gated so no operational data leaks. No secret values are ever returned.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { computeReliability, tierDistribution, type RelJobRow } from '@/lib/admin/reliabilityMetrics';
import { computeFinancials } from '@/lib/financials/adminMetrics';
import { BANK_FEE_RATE } from '@/lib/financials/constants';
import { PRICING_TIERS } from '@/lib/billing/pricingConfig';
import { atlasConfigured } from '@/lib/ai/atlasClient';
import { deepseekConfigured } from '@/lib/ai/deepseekClient';
import { runwayModel } from '@/lib/ai/runway';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_ROWS = 5000;

export async function GET(request: NextRequest) {
  try {
    const sb = createSupabaseServerClient();
    const { data: { user } } = await sb.auth.getUser();
    const gate = assertAdminAccess(request, user ?? null);
    if (!gate.ok) return NextResponse.json({ error: gate.reason }, { status: user ? 403 : 401 });

    const daysParam = Number(new URL(request.url).searchParams.get('days'));
    const days = Number.isFinite(daysParam) && daysParam > 0 ? Math.min(90, Math.floor(daysParam)) : 7;
    const sinceIso = new Date(Date.now() - days * 86_400_000).toISOString();

    // Job reliability (fail-open: absent table → empty snapshot).
    let rows: RelJobRow[] = [];
    try {
      const admin = createServiceRoleClient();
      const { data } = await admin
        .from('generation_jobs')
        .select('service_type, status, created_at, updated_at, params')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS);
      rows = (data ?? []) as RelJobRow[];
    } catch { /* fail-open */ }
    const reliability = computeReliability(rows, days);

    // TRACK 2 — real financials (revenue from wallet_topups; REAL wholesale cost from agent_evolution_traces
    // via computeFinancials — not an estimate) + package/tier distribution. Fail-open: an absent table → 0/[].
    let financials: {
      grossRevenueGel: number; apiRawCostGel: number; netMarginGel: number; netMarginPct: number | null;
      topupCount: number; packageDistribution: { tier: string; count: number; totalGel: number }[];
    } = { grossRevenueGel: 0, apiRawCostGel: 0, netMarginGel: 0, netMarginPct: null, topupCount: 0, packageDistribution: [] };
    try {
      const admin = createServiceRoleClient();
      const [topupsRes, tracesRes] = await Promise.all([
        admin.from('wallet_topups').select('amount_gel').gte('created_at', sinceIso),
        admin.from('agent_evolution_traces').select('cost_wholesale_gel, cost_retail_gel, worker_kind, status').gte('created_at', sinceIso),
      ]);
      const topups = topupsRes.data ?? [];
      const summary = computeFinancials({ topups, traces: tracesRes.data ?? [], bankFeeRate: BANK_FEE_RATE });
      const amounts = topups.map((t) => (typeof t?.amount_gel === 'number' ? t.amount_gel : parseFloat(String(t?.amount_gel)) || 0));
      financials = {
        grossRevenueGel: summary.grossRevenueGel,
        apiRawCostGel: summary.apiRawCostGel,
        netMarginGel: summary.netMarginGel,
        netMarginPct: summary.netMarginPct,
        topupCount: summary.topupCount,
        packageDistribution: tierDistribution(amounts, PRICING_TIERS.map((t) => ({ name: t.name, priceGel: t.priceGel }))),
      };
    } catch { /* fail-open → zeros */ }

    // Provider-key state (presence only; mirrors llmText/health gates). scenePlanningLive is the decisive
    // "is generation degraded to deterministic beats?" signal.
    const has = (...names: string[]) => names.some((n) => String(process.env[n] || '').trim().length > 0);
    const providers = {
      deepseekDirect: deepseekConfigured(),
      atlasDeepseek: atlasConfigured(),
      gemini: has('GEMINI_API_KEY'),
      anthropic: has('ANTHROPIC_API_KEY'),
      replicate: has('REPLICATE_API_TOKEN'),
      runway: has('RUNWAY_API_KEY', 'RUNWAYML_API_SECRET'),
      elevenlabs: has('ELEVENLABS_API_KEY'),
      nanobanana: has('NANOBANANA_API_KEY'),
      heygen: has('HEYGEN_API_KEY'),
      udio: has('UDIO_API_KEY'),
    };
    const scenePlanningLive = providers.deepseekDirect || providers.atlasDeepseek || providers.gemini || providers.anthropic;

    const warnings: string[] = [];
    if (!scenePlanningLive) warnings.push('No text-LLM key bound — scene planning falls back to deterministic beats. Bind DEEPSEEK_API_KEY / ATLAS_API_KEY / GEMINI_API_KEY.');
    // TRACK 4 — HeyGen integration gate: the avatar/talking-photo path silently drops without this key.
    if (!providers.heygen) warnings.push('HEYGEN_API_KEY not bound — the HeyGen avatar/talking-photo path is unavailable (renders fall to the Replicate lip-sync leg).');
    if (/v1[.\-]?6/i.test((process.env.REPLICATE_VIDEO_MODEL || '').trim())) warnings.push('REPLICATE_VIDEO_MODEL pinned to a v1.6 tier — unset it to restore the Kling v2.1 lock.');
    for (const s of reliability.perService) {
      if (s.successRate !== null && s.successRate < 0.7 && s.completed + s.failed >= 5) {
        warnings.push(`${s.service}: success rate ${Math.round(s.successRate * 100)}% over the last ${days}d (${s.failed} failed).`);
      }
    }

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      scenePlanningLive,
      providers,
      videoModel: (process.env.REPLICATE_VIDEO_MODEL || 'kwaivgi/kling-v2.1').trim(),
      runwayModel: runwayModel(),
      reliability,
      financials,
      warnings,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'reliability check failed' }, { status: 500 });
  }
}
