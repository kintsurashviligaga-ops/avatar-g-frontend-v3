/**
 * GET /api/pipeline/health
 * Admin-only full pipeline health (env-derived, names-only — never returns a secret).
 * Non-admins / signed-out get a minimal public "operational" ping. Fail-open: any error
 * still returns 200 with the public payload so a monitor never sees a spurious 5xx.
 *
 * (Distinct from /api/pipeline/status, which is the per-job SSE progress stream.)
 */
import { NextResponse } from 'next/server';
import { checkPipelineHealth } from '@/lib/pipeline/statusAgent';
import { createServerClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'kintsurashviligaga@gmail.com';

export async function GET() {
  const publicPayload = { status: 'operational', timestamp: new Date().toISOString() };
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    const isAdmin = isAdminUser(user) || user?.email?.toLowerCase() === ADMIN_EMAIL;
    if (!isAdmin) return NextResponse.json(publicPayload);

    const health = await checkPipelineHealth();
    return NextResponse.json(health);
  } catch {
    return NextResponse.json(publicPayload);
  }
}
