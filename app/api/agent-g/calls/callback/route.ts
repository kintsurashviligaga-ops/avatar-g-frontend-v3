import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { queueAgentGCallback } from '@/lib/agent-g/voice/callback-dispatch';

export const dynamic = 'force-dynamic';

const schema = z.object({
  taskId: z.string().uuid(),
  summary: z.string().min(1),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid callback payload');

    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const queued = await queueAgentGCallback({
      userId: user.id,
      taskId: payload.data.taskId,
      taskGoal: 'Task completion callback',
      summary: payload.data.summary,
      dashboardUrl: `${request.nextUrl.origin}/services/agent-g/dashboard`,
      force: payload.data.force,
    });

    return apiSuccess(queued);
  } catch (error) {
    return apiError(error, 500, 'Failed to queue callback');
  }
}
