/**
 * GET /api/admin/dashboard?days=30 — the admin dashboard's numbers for a rolling window (1–365 days): revenue, bank
 * fees, provider cost, credits sold / spent, active and paying users, one row per day. lib/admin/dashboard.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { adminContext } from '@/lib/admin/routeContext';
import { loadDashboard } from '@/lib/admin/dashboard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const gate = await adminContext();
  if (!gate.ok) return gate.response;
  const raw = Number(new URL(req.url).searchParams.get('days'));
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(365, Math.floor(raw)) : 30;
  return NextResponse.json(await loadDashboard(gate.svc, days));
}
