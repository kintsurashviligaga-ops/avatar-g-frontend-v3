import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveSmmOwnerContext } from '@/lib/smm/server';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  projectId: z.string().uuid().optional(),
  postIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const owner = await resolveSmmOwnerContext(request);
    if (!owner) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid publish payload');
    }

    const supabase = createServiceRoleClient();
    const projectId = payload.data.projectId;

    const jobInsert = await supabase
      .from('service_jobs')
      .insert({
        user_id: owner.ownerId,
        service_slug: 'social-media-publishing',
        title: 'SMM publish run',
        status: 'processing',
        progress: 30,
        input_payload: {
          project_id: projectId ?? null,
          post_ids: payload.data.postIds ?? null,
          queue: 'publishing',
        },
        output_payload: null,
        heartbeat_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (jobInsert.error || !jobInsert.data) {
      return apiError(jobInsert.error ?? new Error('Failed to create publish job'), 500, 'Failed to enqueue publish job');
    }

    let query = supabase
      .from('smm_posts')
      .update({ status: 'published', scheduled_at: new Date().toISOString() })
      .eq('owner_id', owner.ownerId);

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (payload.data.postIds && payload.data.postIds.length > 0) {
      query = query.in('id', payload.data.postIds);
    }

    const { data: publishedRows, error: publishError } = await query.select('id, title, status, scheduled_at');

    if (publishError) {
      await supabase
        .from('service_jobs')
        .update({
          status: 'failed',
          progress: 100,
          error_message: publishError.message,
          heartbeat_at: new Date().toISOString(),
        })
        .eq('id', jobInsert.data.id);

      return apiError(publishError, 500, 'Failed to publish posts');
    }

    await supabase
      .from('service_jobs')
      .update({
        status: 'completed',
        progress: 100,
        output_payload: {
          published_count: publishedRows?.length ?? 0,
          queue: 'publishing',
          completed_at: new Date().toISOString(),
        },
        heartbeat_at: new Date().toISOString(),
      })
      .eq('id', jobInsert.data.id);

    return apiSuccess({
      job: jobInsert.data,
      published: publishedRows ?? [],
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to publish social posts');
  }
}
