import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveSmmOwnerContext } from '@/lib/smm/server';

export const dynamic = 'force-dynamic';

const postInputSchema = z.object({
  day_index: z.number().int().min(1),
  title: z.string().min(2).max(220),
  hook: z.string().min(2).max(300),
  caption: z.string().min(2).max(2000),
  hashtags: z.array(z.string()).default([]),
  status: z.enum(['draft', 'planned', 'scheduled', 'published']).default('planned'),
  scheduled_at: z.string().datetime().nullable().optional(),
});

const payloadSchema = z.object({
  posts: z.array(postInputSchema).min(1),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const owner = await resolveSmmOwnerContext(request);
    if (!owner) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid posts payload');
    }

    const supabase = createServiceRoleClient();

    const { data: project, error: projectError } = await supabase
      .from('smm_projects')
      .select('id, owner_id')
      .eq('id', params.id)
      .eq('owner_id', owner.ownerId)
      .maybeSingle();

    if (projectError) {
      return apiError(projectError, 500, 'Failed to verify project');
    }

    if (!project) {
      return apiError(new Error('Project not found'), 404, 'Project not found');
    }

    await supabase.from('smm_posts').delete().eq('project_id', params.id);

    const rows = payload.data.posts.map((post) => ({
      project_id: params.id,
      day_index: post.day_index,
      title: post.title,
      hook: post.hook,
      caption: post.caption,
      hashtags: post.hashtags,
      status: post.status,
      scheduled_at: post.scheduled_at ?? null,
    }));

    const { data, error } = await supabase
      .from('smm_posts')
      .insert(rows)
      .select('*')
      .order('day_index', { ascending: true });

    if (error) {
      return apiError(error, 500, 'Failed to save posts');
    }

    return apiSuccess({ posts: data ?? [] }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to save posts');
  }
}
