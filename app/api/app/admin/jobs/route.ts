import { NextResponse } from 'next/server';
import { createServiceRoleClient, createServerClient } from '@/lib/supabase/server';
import { effectiveAdminAllowlist } from '@/lib/auth/adminGuard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const server = createServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ⚠️ ADMIN ONLY. A signed-in session was the whole gate, so ANY self-registered account read platform-wide data through
  // the service-role client below. The gate is the imported email allowlist — never user_metadata or a profile row.
  const email = (user.email ?? '').trim().toLowerCase();
  if (!email || !(await effectiveAdminAllowlist()).includes(email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const serviceRole = createServiceRoleClient();
  const { data, error } = await serviceRole
    .from('service_jobs')
    .select('*')
    .in('status', ['failed', 'processing'])
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}