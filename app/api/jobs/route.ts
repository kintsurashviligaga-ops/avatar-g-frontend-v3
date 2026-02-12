// Jobs Enqueue API Route
// POST /api/jobs

import { NextRequest } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { JobEnqueueRequestSchema, validateInput } from '@/lib/api/validation';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  try {
    const supabase = createRouteHandlerClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return apiError(new Error('Unauthorized'), 401, 'Unauthorized');
    }

    const token = authHeader.slice(7);
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData.user) {
      return apiError(new Error('Unauthorized'), 401, 'Unauthorized');
    }

    const body = await request.json();
    const validation = validateInput(JobEnqueueRequestSchema, body);

    if (!validation.success) {
      return apiError(new Error(validation.error), 400, 'Invalid request');
    }

    const { type, payload, related_id } = validation.data;

    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: userData.user.id,
        type,
        status: 'queued',
        progress: 0,
        input_json: payload,
        related_id: related_id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (jobError || !job) {
      return apiError(jobError, 500, 'Failed to enqueue job');
    }

    return apiSuccess({
      job_id: job.id,
      status: job.status,
      type: job.type
    });
  } catch (error) {
    return apiError(error, 500);
  }
}
