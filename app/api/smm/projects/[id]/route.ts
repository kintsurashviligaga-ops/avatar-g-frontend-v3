import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveSmmOwnerContext } from '@/lib/smm/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const owner = await resolveSmmOwnerContext(request);
    if (!owner) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const supabase = createServiceRoleClient();

    const { data: project, error: projectError } = await supabase
      .from('smm_projects')
      .select('*')
      .eq('id', params.id)
      .eq('owner_id', owner.ownerId)
      .maybeSingle();

    if (projectError) {
      return apiError(projectError, 500, 'Failed to load project');
    }

    if (!project) {
      return apiSuccess({ project: null, posts: [], assets: [] });
    }

    const { data: posts, error: postError } = await supabase
      .from('smm_posts')
      .select('*')
      .eq('project_id', params.id)
      .order('day_index', { ascending: true });

    if (postError) {
      return apiError(postError, 500, 'Failed to load posts');
    }

    const postIds = (posts ?? []).map((post) => post.id);
    let assets: Array<Record<string, unknown>> = [];

    if (postIds.length > 0) {
      const { data: assetRows, error: assetError } = await supabase
        .from('smm_assets')
        .select('*')
        .in('post_id', postIds)
        .order('created_at', { ascending: false });

      if (assetError) {
        return apiError(assetError, 500, 'Failed to load assets');
      }

      assets = assetRows ?? [];
    }

    return apiSuccess({ project, posts: posts ?? [], assets });
  } catch (error) {
    return apiError(error, 500, 'Failed to load project');
  }
}
