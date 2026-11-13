import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';
import { LIFECYCLE, lifecycleBlockers, lifecycleReport } from '@/lib/capabilities/lifecycle';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/admin/lifecycle — the Google lifecycle registry (config/google-lifecycle.json) against today, for a person
 * to read (v5.1 M-1). One row per served model, worst first, with its alarm level (retired / urgent / block / warn /
 * unknown / none / ok), days left, the replacement and the official source page. Read-only: no Google call, no write.
 *
 * ADMIN ONLY (404 otherwise).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!(await assertAdminAccess(req, user)).ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const now = new Date();
  return NextResponse.json({
    version: LIFECYCLE.version,
    today: now.toISOString().slice(0, 10),
    rules: { ciBlockDays: LIFECYCLE.rules.ciBlockDays, urgentDays: LIFECYCLE.rules.urgentDays, warnDays: LIFECYCLE.rules.warnDays },
    blockers: lifecycleBlockers(now),
    served: lifecycleReport(now),
  });
}
