import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveSmmOwnerContext } from '@/lib/smm/server';

export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  projectId: z.string().uuid().optional(),
  format: z.enum(['csv', 'json']).default('csv'),
  posts: z
    .array(
      z.object({
        day_index: z.number().int(),
        title: z.string(),
        hook: z.string(),
        caption: z.string(),
        hashtags: z.array(z.string()).default([]),
        status: z.string(),
        scheduled_at: z.string().nullable().optional(),
      })
    )
    .optional(),
});

function toCsv(rows: Array<Record<string, unknown>>) {
  const headers = ['day_index', 'title', 'hook', 'caption', 'hashtags', 'status', 'scheduled_at'];
  const lines = [headers.join(',')];

  rows.forEach((row) => {
    const line = headers
      .map((header) => {
        const value = row[header];
        const normalized = Array.isArray(value) ? value.join(' ') : (value ?? '').toString();
        const escaped = normalized.replace(/"/g, '""');
        return `"${escaped}"`;
      })
      .join(',');

    lines.push(line);
  });

  return lines.join('\n');
}

export async function POST(request: NextRequest) {
  try {
    const owner = await resolveSmmOwnerContext(request);
    if (!owner) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = exportSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid export payload');
    }

    let posts: Array<Record<string, unknown>> = [];

    if (payload.data.projectId) {
      const supabase = createServiceRoleClient();

      const { data: project, error: projectError } = await supabase
        .from('smm_projects')
        .select('id, owner_id')
        .eq('id', payload.data.projectId)
        .eq('owner_id', owner.ownerId)
        .maybeSingle();

      if (projectError) {
        return apiError(projectError, 500, 'Failed to verify project');
      }

      if (!project) {
        return apiError(new Error('Project not found'), 404, 'Project not found');
      }

      const { data: rows, error: postsError } = await supabase
        .from('smm_posts')
        .select('day_index,title,hook,caption,hashtags,status,scheduled_at')
        .eq('project_id', payload.data.projectId)
        .order('day_index', { ascending: true });

      if (postsError) {
        return apiError(postsError, 500, 'Failed to export posts');
      }

      posts = rows ?? [];
    } else {
      posts = payload.data.posts ?? [];
    }

    if (payload.data.format === 'json') {
      return apiSuccess({ format: 'json', content: JSON.stringify(posts, null, 2) });
    }

    return apiSuccess({ format: 'csv', content: toCsv(posts) });
  } catch (error) {
    return apiError(error, 500, 'Failed to export data');
  }
}
