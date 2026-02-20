import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiSuccess({ guest: true, tasks: [], subtasks: [] });
    }

    const taskId = request.nextUrl.searchParams.get('task_id');
    const supabase = createServiceRoleClient();

    let query = supabase.from('agent_g_tasks').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
    if (taskId) {
      query = query.eq('id', taskId);
    }

    const { data: tasks, error: taskError } = await query;
    if (taskError) {
      return apiError(taskError, 500, 'Failed to load task status');
    }

    const ids = (tasks ?? []).map((item) => item.id);
    let subtasks: unknown[] = [];
    if (ids.length > 0) {
      const subtaskRes = await supabase
        .from('agent_g_subtasks')
        .select('*')
        .in('task_id', ids)
        .order('created_at', { ascending: true });

      if (!subtaskRes.error) {
        subtasks = subtaskRes.data ?? [];
      }
    }

    return apiSuccess({ guest: false, tasks: tasks ?? [], subtasks });
  } catch (error) {
    return apiError(error, 500, 'Failed to load status');
  }
}
