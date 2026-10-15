import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { veoCapStatus } from '@/lib/veo/dailyCap';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/veo-budget — the daily Veo ceiling as this deployment sees it (lib/veo/dailyCap.ts): whether it is on, the
 * figure, the UTC day, what Redis has reserved today and what the trace ledger has booked today. Read-only; changing the
 * figure is the VEO_DAILY_LIMIT_USD environment variable. ADMIN ONLY (404 otherwise).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!(await assertAdminAccess(req, user)).ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(await veoCapStatus(), { headers: { 'Cache-Control': 'no-store' } });
}
