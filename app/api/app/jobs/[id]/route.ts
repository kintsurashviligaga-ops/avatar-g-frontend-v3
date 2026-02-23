import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { StabilityAvatarProvider } from '@/lib/providers/stability';
import { OpenAIProvider } from '@/lib/providers/openai';
import { DeepSeekProvider } from '@/lib/providers/deepseek';
import { recordMeteringEvent } from '@/lib/monetization/metering';
import { logJobExecution } from '@/lib/observability/runtime';

export const dynamic = 'force-dynamic';

type ServiceJobRecord = {
  id: string;
  user_id: string;
  service_slug: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  attempt_count: number;
  input_payload: Record<string, unknown>;
  output_payload: Record<string, unknown> | null;
};

async function processImageCreatorJob(input: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  job: ServiceJobRecord;
}) {
  if (input.job.service_slug !== 'image-creator') {
    return input.job;
  }

  const claimed = await input.supabase
    .from('service_jobs')
    .update({
      status: 'processing',
      progress: 20,
      heartbeat_at: new Date().toISOString(),
      attempt_count: (input.job.attempt_count ?? 0) + 1,
      error_message: null,
    })
    .eq('id', input.job.id)
    .eq('user_id', input.userId)
    .eq('status', 'queued')
    .select('*')
    .single();

  if (claimed.error || !claimed.data) {
    return input.job;
  }

  const provider = new StabilityAvatarProvider();
  if (!provider.isAvailable()) {
    const { data: failedJob } = await input.supabase
      .from('service_jobs')
      .update({
        status: 'failed',
        progress: 100,
        error_message: 'STABILITY_API_KEY is not configured',
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', input.job.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();

    return (failedJob ?? claimed.data) as ServiceJobRecord;
  }

  try {
    const started = Date.now();
    const prompt = String(claimed.data.input_payload?.prompt ?? '').trim();
    const stylePreset = String(claimed.data.input_payload?.style ?? 'photographic').toLowerCase();
    const width = Number(claimed.data.input_payload?.width ?? 768);
    const height = Number(claimed.data.input_payload?.height ?? 768);

    await input.supabase
      .from('service_jobs')
      .update({ progress: 55, heartbeat_at: new Date().toISOString() })
      .eq('id', input.job.id)
      .eq('user_id', input.userId);

    const generated = await provider.generate({
      prompt,
      style_preset: stylePreset,
      width,
      height,
      num_inference_steps: 30,
      guidance_scale: 7,
    });

    const previewUrl = generated.image_url;

    const { data: output } = await input.supabase
      .from('service_outputs')
      .insert({
        user_id: input.userId,
        service_slug: 'image-creator',
        job_id: input.job.id,
        output_type: 'image',
        external_url: previewUrl,
        metadata: {
          prompt,
          style: stylePreset,
          resolution: `${width}x${height}`,
          provider: 'stability',
          generation_time_ms: generated.generation_time_ms,
          seed: generated.metadata?.seed,
        },
      })
      .select('*')
      .single();

    const { data: completedJob } = await input.supabase
      .from('service_jobs')
      .update({
        status: 'completed',
        progress: 100,
        heartbeat_at: new Date().toISOString(),
        output_payload: {
          preview_url: previewUrl,
          output_id: output?.id ?? null,
          provider: 'stability',
        },
      })
      .eq('id', input.job.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();

    const { count: completedCount } = await input.supabase
      .from('service_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', input.userId)
      .eq('status', 'completed');

    if ((completedCount ?? 0) <= 1) {
      await input.supabase.from('events').insert({
        type: 'first_success_output_next_step',
        user_id: input.userId,
        org_id: (claimed.data as { org_id?: string | null }).org_id ?? null,
        metadata: {
          service_slug: 'image-creator',
          job_id: input.job.id,
          suggestion: 'Try chaining this output into Video Studio or Social Media Manager.',
        },
      });
    }

    await Promise.all([
      recordMeteringEvent({
        user_id: input.userId,
        org_id: (claimed.data as { org_id?: string | null }).org_id ?? null,
        service_id: 'image-creator',
        route: '/api/app/jobs/[id]',
        units: 1,
        event_type: 'job_execution',
        metadata: {
          job_id: input.job.id,
          generation_time_ms: generated.generation_time_ms,
        },
      }),
      recordMeteringEvent({
        user_id: input.userId,
        org_id: (claimed.data as { org_id?: string | null }).org_id ?? null,
        service_id: 'image-creator',
        route: '/api/app/jobs/[id]',
        units: String(previewUrl).length,
        event_type: 'storage_output',
        metadata: {
          job_id: input.job.id,
          external_url: previewUrl,
        },
      }),
      logJobExecution({
        job_id: input.job.id,
        queue: String((claimed.data as { queue_name?: string }).queue_name ?? 'default'),
        duration_ms: Date.now() - started,
        retries: Number((claimed.data as { attempt_count?: number }).attempt_count ?? 0),
        status: 'completed',
      }),
    ]);

    return (completedJob ?? claimed.data) as ServiceJobRecord;
  } catch (error) {
    await logJobExecution({
      job_id: input.job.id,
      queue: String((claimed.data as { queue_name?: string }).queue_name ?? 'default'),
      duration_ms: claimed.data.started_at ? Date.now() - new Date(claimed.data.started_at).getTime() : 0,
      retries: Number((claimed.data as { attempt_count?: number }).attempt_count ?? 0),
      status: 'failed',
    });

    const { data: failedJob } = await input.supabase
      .from('service_jobs')
      .update({
        status: 'failed',
        progress: 100,
        error_message: error instanceof Error ? error.message : 'Image generation failed',
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', input.job.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();

    return (failedJob ?? claimed.data) as ServiceJobRecord;
  }
}

async function processTextIntelligenceJob(input: {
  supabase: ReturnType<typeof createServerClient>;
  userId: string;
  job: ServiceJobRecord;
}) {
  if (input.job.service_slug !== 'text-intelligence') {
    return input.job;
  }

  const claimed = await input.supabase
    .from('service_jobs')
    .update({
      status: 'processing',
      progress: 20,
      heartbeat_at: new Date().toISOString(),
      attempt_count: (input.job.attempt_count ?? 0) + 1,
      error_message: null,
    })
    .eq('id', input.job.id)
    .eq('user_id', input.userId)
    .eq('status', 'queued')
    .select('*')
    .single();

  if (claimed.error || !claimed.data) {
    return input.job;
  }

  const feature = String(claimed.data.input_payload?.feature ?? 'summarize');
  const prompt = String(claimed.data.input_payload?.prompt ?? '').trim();

  const openai = new OpenAIProvider();
  const deepseek = new DeepSeekProvider();
  const provider = openai.isAvailable() ? openai : deepseek.isAvailable() ? deepseek : null;

  if (!provider) {
    const { data: failedJob } = await input.supabase
      .from('service_jobs')
      .update({
        status: 'failed',
        progress: 100,
        error_message: 'No real text provider configured (OPENAI_API_KEY or DEEPSEEK_API_KEY required)',
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', input.job.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();

    return (failedJob ?? claimed.data) as ServiceJobRecord;
  }

  const systemPromptMap: Record<string, string> = {
    summarize: 'Summarize the input text in Georgian. Keep key facts and clear structure.',
    translate: 'Translate the input text to English while preserving meaning and tone.',
    seo: 'Rewrite and optimize this text for SEO with readable structure and keyword relevance.',
    sentiment: 'Analyze sentiment and provide concise explanation with positive/neutral/negative balance.',
  };

  try {
    const started = Date.now();
    await input.supabase
      .from('service_jobs')
      .update({ progress: 60, heartbeat_at: new Date().toISOString() })
      .eq('id', input.job.id)
      .eq('user_id', input.userId);

    const generated = await provider.generateText({
      prompt,
      system_prompt: systemPromptMap[feature] ?? systemPromptMap.summarize,
      max_tokens: 1200,
      temperature: feature === 'translate' ? 0.2 : 0.5,
    });

    const { data: output } = await input.supabase
      .from('service_outputs')
      .insert({
        user_id: input.userId,
        service_slug: 'text-intelligence',
        job_id: input.job.id,
        output_type: 'text',
        external_url: `data:text/plain;charset=utf-8,${encodeURIComponent(generated.text)}`,
        metadata: {
          feature,
          prompt,
          provider: provider.name,
          model: generated.model,
          tokens_in: generated.tokens_in,
          tokens_out: generated.tokens_out,
          cost_usd: generated.cost_usd,
          generation_time_ms: generated.generation_time_ms,
        },
      })
      .select('*')
      .single();

    const { data: completedJob } = await input.supabase
      .from('service_jobs')
      .update({
        status: 'completed',
        progress: 100,
        heartbeat_at: new Date().toISOString(),
        output_payload: {
          text: generated.text,
          output_id: output?.id ?? null,
          provider: provider.name,
          model: generated.model,
          usage: {
            tokens_in: generated.tokens_in,
            tokens_out: generated.tokens_out,
            cost_usd: generated.cost_usd,
          },
        },
      })
      .eq('id', input.job.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();

    const { count: completedCount } = await input.supabase
      .from('service_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', input.userId)
      .eq('status', 'completed');

    if ((completedCount ?? 0) <= 1) {
      await input.supabase.from('events').insert({
        type: 'first_success_output_next_step',
        user_id: input.userId,
        org_id: (claimed.data as { org_id?: string | null }).org_id ?? null,
        metadata: {
          service_slug: 'text-intelligence',
          job_id: input.job.id,
          suggestion: 'Use this result in Prompt Builder or Social Media workflows.',
        },
      });
    }

    await Promise.all([
      recordMeteringEvent({
        user_id: input.userId,
        org_id: (claimed.data as { org_id?: string | null }).org_id ?? null,
        service_id: 'text-intelligence',
        route: '/api/app/jobs/[id]',
        units: Number(generated.tokens_in ?? 0) + Number(generated.tokens_out ?? 0),
        event_type: 'tokens',
        metadata: {
          job_id: input.job.id,
          provider: provider.name,
          model: generated.model,
        },
      }),
      recordMeteringEvent({
        user_id: input.userId,
        org_id: (claimed.data as { org_id?: string | null }).org_id ?? null,
        service_id: 'text-intelligence',
        route: '/api/app/jobs/[id]',
        units: 1,
        event_type: 'job_execution',
        metadata: {
          job_id: input.job.id,
        },
      }),
      logJobExecution({
        job_id: input.job.id,
        queue: String((claimed.data as { queue_name?: string }).queue_name ?? 'default'),
        duration_ms: Date.now() - started,
        retries: Number((claimed.data as { attempt_count?: number }).attempt_count ?? 0),
        status: 'completed',
      }),
    ]);

    return (completedJob ?? claimed.data) as ServiceJobRecord;
  } catch (error) {
    await logJobExecution({
      job_id: input.job.id,
      queue: String((claimed.data as { queue_name?: string }).queue_name ?? 'default'),
      duration_ms: claimed.data.started_at ? Date.now() - new Date(claimed.data.started_at).getTime() : 0,
      retries: Number((claimed.data as { attempt_count?: number }).attempt_count ?? 0),
      status: 'failed',
    });

    const { data: failedJob } = await input.supabase
      .from('service_jobs')
      .update({
        status: 'failed',
        progress: 100,
        error_message: error instanceof Error ? error.message : 'Text processing failed',
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', input.job.id)
      .eq('user_id', input.userId)
      .select('*')
      .single();

    return (failedJob ?? claimed.data) as ServiceJobRecord;
  }
}

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

  const shouldAutoProcess = _request.nextUrl.searchParams.get('autoProcess') !== '0';
  if (shouldAutoProcess && (data.status === 'queued' || data.status === 'processing')) {
    if (data.service_slug === 'image-creator') {
      const job = await processImageCreatorJob({
        supabase,
        userId: user.id,
        job: data as ServiceJobRecord,
      });
      return NextResponse.json({ job });
    }

    if (data.service_slug === 'text-intelligence') {
      const job = await processTextIntelligenceJob({
        supabase,
        userId: user.id,
        job: data as ServiceJobRecord,
      });
      return NextResponse.json({ job });
    }
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
    retry?: boolean;
    cancel?: boolean;
  };

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (body.status) updates.status = body.status;
  if (typeof body.progress === 'number') updates.progress = body.progress;
  if (body.outputPayload !== undefined) updates.output_payload = body.outputPayload;
  if (body.errorMessage !== undefined) updates.error_message = body.errorMessage;
  if (body.retry) {
    updates.status = 'queued';
    updates.progress = 0;
    updates.error_message = null;
  }
  if (body.cancel) {
    updates.status = 'failed';
    updates.progress = 100;
    updates.error_message = 'Cancelled by user';
  }

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