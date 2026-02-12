// Avatar Generation API Route
// POST /api/avatar/generate

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { AvatarGenerationSchema, validateInput } from '@/lib/api/validation';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { requireKey } from '@/lib/api/key-checker';
import type { GenerateAvatarRequest } from '@/types/avatar-builder';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  try {
    // 0. Check if avatar generation is available
    try {
      requireKey('Avatar Generation', 'stability');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Service unavailable';
      return apiError(
        new Error(message),
        503,
        'Avatar generation service is not available. Please try again later.'
      );
    }

    // 1. Auth check
    const supabase = createRouteHandlerClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    // 2. Parse + validate request body
    const body: GenerateAvatarRequest = await request.json();
    const validation = validateInput(AvatarGenerationSchema, body);

    if (!validation.success) {
      return apiError(new Error(validation.error), 400, 'Invalid request');
    }

    const input = validation.data;

    // 3. Create avatar record in DB (status: queued)
    const { data: avatar, error: insertError } = await supabase
      .from('avatars')
      .insert({
        user_id: userId,
        prompt: input.prompt,
        negative_prompt: body.negative_prompt,
        style_preset: input.stylePreset,
        body_type: input.bodyType,
        pose: input.pose,
        seed: input.seed,
        status: 'queued',
        progress: 0
      })
      .select()
      .single();

    if (insertError || !avatar) {
      return apiError(insertError, 500, 'Failed to create avatar record');
    }

    // 4. Create job record
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        type: 'generate_avatar',
        status: 'queued',
        progress: 0,
        related_id: avatar.id,
        input_json: input
      })
      .select()
      .single();

    if (jobError) {
      return apiError(jobError, 500, 'Failed to create job');
    }

    // 5. Return job info (worker will process)
    return apiSuccess({
      job_id: job?.id,
      avatar_id: avatar.id,
      status: 'queued'
    });

  } catch (error) {
    return apiError(error, 500);
  }
}
