import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = request.nextUrl.searchParams.get('service');
  const status = request.nextUrl.searchParams.get('status');

  let query = supabase
    .from('service_jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(80);

  if (service) query = query.eq('service_slug', service);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    serviceSlug?: string;
    title?: string;
    inputPayload?: Record<string, unknown>;
  };

  if (!body.serviceSlug || !body.title) {
    return NextResponse.json({ error: 'serviceSlug and title are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('service_jobs')
    .insert({
      user_id: user.id,
      service_slug: body.serviceSlug,
      title: body.title,
      status: 'queued',
      progress: 0,
      input_payload: body.inputPayload ?? {},
      max_attempts: 3,
      attempt_count: 0,
    })
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to create job' }, { status: 500 });
  }

  return NextResponse.json({ job: data });
}