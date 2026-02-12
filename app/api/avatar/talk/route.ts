// Talking Avatar Generation API Route
// POST /api/avatar/talk

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import type { GenerateTalkClipRequest } from '@/types/avatar-builder';

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  try {
    const supabase = createRouteHandlerClient();
    
    // Auth check
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body: GenerateTalkClipRequest = await request.json();

    // Validate
    if (!body.text || body.text.trim().length === 0) {
      return apiError(new Error('Text is required'), 400, 'Invalid request');
    }

    if (!body.language) {
      return apiError(new Error('Language is required'), 400, 'Invalid request');
    }

    // Create talk clip record
    const { data: talkClip, error: insertError } = await supabase
      .from('talk_clips')
      .insert({
        user_id: userId,
        avatar_id: body.avatar_id,
        text: body.text,
        voice_slot: body.voice_slot || 'default',
        language: body.language,
        tone: body.tone,
        speed: body.speed || 1.0,
        status: 'queued'
      })
      .select()
      .single();

    if (insertError || !talkClip) {
      return apiError(insertError, 500, 'Failed to create talk clip record');
    }

    // Create job record (worker will process)
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        type: 'talk_clip',
        status: 'queued',
        progress: 0,
        related_id: talkClip.id,
        input_json: body
      })
      .select()
      .single();

    if (jobError) {
      return apiError(jobError, 500, 'Failed to create job');
    }

    return apiSuccess({
      job_id: job?.id,
      talk_clip_id: talkClip.id,
      status: 'queued'
    });

  } catch (error) {
    return apiError(error, 500);
  }
}
