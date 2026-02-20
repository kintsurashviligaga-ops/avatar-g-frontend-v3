import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { buildTaskPlan } from '@/lib/agent-g/orchestrator/planner';

export const dynamic = 'force-dynamic';

const schema = z.object({
  goal: z.string().min(3).max(3000),
});

export async function POST(request: NextRequest) {
  try {
    const payload = schema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid planning payload');
    }

    const plan = buildTaskPlan(payload.data.goal);
    return apiSuccess({ plan });
  } catch (error) {
    return apiError(error, 500, 'Failed to build task plan');
  }
}
