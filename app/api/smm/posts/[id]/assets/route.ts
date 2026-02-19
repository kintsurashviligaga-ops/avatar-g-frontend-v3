import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveSmmOwnerContext } from '@/lib/smm/server';

export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  type: z.enum(['image', 'video', 'music', 'avatar']),
  provider: z.string().min(1).max(60).default('avatar-g'),
  status: z.enum(['pending', 'ready', 'error']).default('pending'),
  url: z.string().url().nullable().optional(),
  meta: z.record(z.unknown()).default({}),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const owner = await resolveSmmOwnerContext(request);
    if (!owner) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid asset payload');
    }

    const supabase = createServiceRoleClient();

    const { data: postRow, error: postError } = await supabase
      .from('smm_posts')
      .select('id, project_id')
      .eq('id', params.id)
      .maybeSingle();

    if (postError) {
      return apiError(postError, 500, 'Failed to verify post');
    }

    if (!postRow) {
      return apiError(new Error('Post not found'), 404, 'Post not found');
    }

    const { data: projectRow, error: projectError } = await supabase
      .from('smm_projects')
      .select('id, owner_id')
      .eq('id', postRow.project_id)
      .eq('owner_id', owner.ownerId)
      .maybeSingle();

    if (projectError) {
      return apiError(projectError, 500, 'Failed to verify ownership');
    }

    if (!projectRow) {
      return apiError(new Error('Forbidden'), 403, 'Access denied');
    }

    const { data, error } = await supabase
      .from('smm_assets')
      .insert({
        post_id: params.id,
        type: payload.data.type,
        provider: payload.data.provider,
        status: payload.data.status,
        url: payload.data.url ?? null,
        meta: payload.data.meta,
      })
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to save asset');
    }

    return apiSuccess({ asset: data }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to save asset');
  }
}
