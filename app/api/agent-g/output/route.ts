import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { renderPdf, renderZipPackage } from '@/lib/agent-g/orchestrator/formatter';

type AggregatedResult = {
  summary: string;
  markdown: string;
  outputs?: { audio?: boolean; video?: boolean };
};

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const taskId = request.nextUrl.searchParams.get('task_id');
    const format = (request.nextUrl.searchParams.get('format') || 'json').toLowerCase();

    if (!taskId) {
      return apiError(new Error('task_id missing'), 400, 'task_id is required');
    }

    const supabase = createServiceRoleClient();
    const { data: task, error } = await supabase
      .from('agent_g_tasks')
      .select('id,goal,results,status')
      .eq('id', taskId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) return apiError(error, 500, 'Failed to load task output');
    if (!task) return apiError(new Error('Not found'), 404, 'Task not found');

    const results = (task.results || null) as AggregatedResult | null;
    if (!results) {
      return apiError(new Error('No output'), 404, 'Task output not ready');
    }

    if (format === 'markdown') {
      return new Response(results.markdown, {
        status: 200,
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="agent-g-${task.id}.md"`,
        },
      });
    }

    if (format === 'pdf') {
      const pdf = await renderPdf(task.goal, {
        summary: results.summary,
        markdown: results.markdown,
        subtasks: (task.results as { subtasks?: [] })?.subtasks || [],
        outputs: {
          text: true,
          pdf: true,
          zip: true,
          audio: Boolean(results.outputs?.audio),
          video: Boolean(results.outputs?.video),
        },
      });

      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="agent-g-${task.id}.pdf"`,
        },
      });
    }

    if (format === 'zip') {
      const zip = await renderZipPackage(task.goal, {
        summary: results.summary,
        markdown: results.markdown,
        subtasks: (task.results as { subtasks?: [] })?.subtasks || [],
        outputs: {
          text: true,
          pdf: true,
          zip: true,
          audio: Boolean(results.outputs?.audio),
          video: Boolean(results.outputs?.video),
        },
      });

      return new Response(new Uint8Array(zip), {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="agent-g-${task.id}.zip"`,
        },
      });
    }

    if (format === 'audio') {
      return apiSuccess({
        task_id: task.id,
        available: Boolean(results.outputs?.audio),
        note: 'Audio output is generated via Voice Lab and linked in subtask output when available.',
      });
    }

    if (format === 'video') {
      return apiSuccess({
        task_id: task.id,
        available: Boolean(results.outputs?.video),
        note: 'Video output can be connected to Video Studio pipeline when enabled.',
      });
    }

    return apiSuccess({ task, output: results });
  } catch (error) {
    return apiError(error, 500, 'Failed to fetch output');
  }
}
