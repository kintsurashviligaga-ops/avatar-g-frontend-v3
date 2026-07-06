/**
 * GET /api/admin/jobs — the live generation queue (pending + processing) + recent failures, for the Master
 * Control task deck (v358 #4). isAdmin()-gated (email allowlist; never user/app_metadata). Read via the
 * service-role client (above RLS); fail-open to empty lists.
 */
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { listJobs } from '@/lib/admin/jobs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try {
    const svc = createServiceRoleClient();
    const jobs = await listJobs(svc);
    return NextResponse.json({ ok: true, ...jobs });
  } catch {
    return NextResponse.json({ ok: true, active: [], recentFailed: [] });
  }
}
