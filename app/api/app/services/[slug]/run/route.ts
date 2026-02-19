import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getServiceBySlug } from '@/lib/app/services';

export const dynamic = 'force-dynamic';

function mockOutputUrl(slug: string, id: string) {
  return `https://picsum.photos/seed/${encodeURIComponent(`${slug}-${id}`)}/1280/720`;
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = getServiceBySlug(params.slug);
  if (!service) {
    return NextResponse.json({ error: 'Unknown service slug' }, { status: 404 });
  }

  const body = (await request.json()) as {
    prompt?: string;
    inputPayload?: Record<string, unknown>;
  };

  const prompt = (body.prompt ?? '').trim();
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  const { data: job, error: createJobError } = await supabase
    .from('service_jobs')
    .insert({
      user_id: user.id,
      service_slug: service.slug,
      title: `${service.name} run`,
      status: 'queued',
      progress: 0,
      input_payload: {
        prompt,
        ...(body.inputPayload ?? {}),
      },
      max_attempts: 3,
      attempt_count: 0,
      heartbeat_at: nowIso,
    })
    .select('*')
    .single();

  if (createJobError || !job) {
    return NextResponse.json({ error: createJobError?.message ?? 'Failed to create job' }, { status: 500 });
  }

  try {
    await supabase
      .from('service_jobs')
      .update({
        status: 'processing',
        progress: 40,
        heartbeat_at: new Date().toISOString(),
        attempt_count: (job.attempt_count ?? 0) + 1,
      })
      .eq('id', job.id)
      .eq('user_id', user.id);

    const outputUrl = mockOutputUrl(service.slug, job.id);
    const outputPayload = {
      preview_url: outputUrl,
      completed_at: new Date().toISOString(),
      credits_used: service.credits,
    };

    const { data: completedJob, error: completeError } = await supabase
      .from('service_jobs')
      .update({
        status: 'completed',
        progress: 100,
        output_payload: outputPayload,
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (completeError || !completedJob) {
      throw new Error(completeError?.message ?? 'Failed to complete job');
    }

    const { data: output, error: outputError } = await supabase
      .from('service_outputs')
      .insert({
        user_id: user.id,
        service_slug: service.slug,
        job_id: job.id,
        output_type: service.slug.includes('voice') ? 'audio' : service.slug.includes('video') ? 'video' : 'image',
        external_url: outputUrl,
        metadata: {
          prompt,
          source: 'mvp-mock-pipeline',
        },
      })
      .select('*')
      .single();

    if (outputError || !output) {
      throw new Error(outputError?.message ?? 'Failed to persist output');
    }

    return NextResponse.json({
      job: completedJob,
      output,
    });
  } catch (error) {
    await supabase
      .from('service_jobs')
      .update({
        status: 'failed',
        progress: 100,
        error_message: error instanceof Error ? error.message : 'Unknown failure',
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', job.id)
      .eq('user_id', user.id);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Service run failed' },
      { status: 500 }
    );
  }
}