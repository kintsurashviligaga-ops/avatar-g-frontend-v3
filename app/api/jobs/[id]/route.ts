import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { getJob, updateJob, type JobStatus } from '@/lib/jobs/jobs';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { generateVideo } from '@/lib/ai/runway';

export const dynamic = 'force-dynamic';

async function processVideoJob(userId: string, job: Record<string, unknown>) {
  const supabase = createRouteHandlerClient();
  const jobId = String(job.id || '');
  const jobType = String(job.type || '');
  const status = String(job.status || '');

  if (jobType !== 'generate_video' || !jobId || !['queued', 'processing'].includes(status)) {
    return job;
  }

  const claimed = await updateJob({
    userId,
    id: jobId,
    status: 'processing',
    outputJson: {
      ...(typeof job.output_json === 'object' && job.output_json ? (job.output_json as Record<string, unknown>) : {}),
      progress_note: 'Video rendering in queue',
    },
    error: null,
  });

  const videoClipId = String((job as { video_clip_id?: string }).video_clip_id || '');
  const inputJson = (job.input_json as Record<string, unknown> | undefined) || {};

  if (videoClipId) {
    await supabase
      .from('video_clips')
      .update({ status: 'processing', progress: 35, updated_at: new Date().toISOString() })
      .eq('id', videoClipId)
      .eq('user_id', userId);
  }

  try {
    const prompt = String(inputJson.prompt || 'Generate cinematic video');
    const imageUrl = inputJson.image_url ? String(inputJson.image_url) : undefined;
    const duration = Number(inputJson.duration || 6);

    const rendered = await generateVideo(prompt, imageUrl, duration);

    if (videoClipId) {
      await supabase
        .from('video_clips')
        .update({
          status: 'completed',
          progress: 100,
          video_url: rendered.videoUrl,
          provider: 'runway',
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoClipId)
        .eq('user_id', userId);
    }

    return updateJob({
      userId,
      id: claimed.id,
      status: 'succeeded',
      outputJson: {
        video_url: rendered.videoUrl,
        provider: 'runway',
        duration,
      },
      error: null,
    });
  } catch (error) {
    if (videoClipId) {
      await supabase
        .from('video_clips')
        .update({
          status: 'failed',
          progress: 100,
          error: error instanceof Error ? error.message : 'Video generation failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', videoClipId)
        .eq('user_id', userId);
    }

    return updateJob({
      userId,
      id: claimed.id,
      status: 'failed',
      error: error instanceof Error ? error.message : 'Video generation failed',
    });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const job = await getJob({ userId: user.id, id: params.id });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } },
        { status: 404 }
      );
    }

    const shouldAutoProcess = request.nextUrl.searchParams.get('autoProcess') !== '0';
    if (shouldAutoProcess) {
      const processed = await processVideoJob(user.id, job as unknown as Record<string, unknown>);
      return NextResponse.json({ job: processed });
    }

    return NextResponse.json({ job });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'JOB_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json() as {
      status?: JobStatus;
      outputJson?: Record<string, unknown>;
      error?: string | null;
    };

    const updated = await updateJob({
      userId: user.id,
      id: params.id,
      status: body.status,
      outputJson: body.outputJson,
      error: body.error,
    });

    return NextResponse.json({ job: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'JOB_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
