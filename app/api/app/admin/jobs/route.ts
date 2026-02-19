import { NextResponse } from 'next/server';
import { createServiceRoleClient, createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const server = createServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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