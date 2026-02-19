import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('service_jobs')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ job: data });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as {
    status?: 'queued' | 'processing' | 'completed' | 'failed';
    progress?: number;
    outputPayload?: Record<string, unknown>;
    errorMessage?: string | null;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status) updates.status = body.status;
  if (typeof body.progress === 'number') updates.progress = body.progress;
  if (body.outputPayload !== undefined) updates.output_payload = body.outputPayload;
  if (body.errorMessage !== undefined) updates.error_message = body.errorMessage;

  const { data, error } = await supabase
    .from('service_jobs')
    .update(updates)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 });
  }

  return NextResponse.json({ job: data });
}