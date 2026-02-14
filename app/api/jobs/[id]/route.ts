// Job Status API Route
// GET /api/jobs/[id]

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Supabase operations require nodejs

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
  if (rateLimitError) return rateLimitError;

  try {
    const supabase = createRouteHandlerClient();

    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const { data: userData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !userData.user) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const jobId = params.id;

    if (!jobId) {
      return apiError(new Error('Missing job id'), 400, 'Invalid request');
    }

    // Fetch job
    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userData.user.id)
      .single();

    if (error || !job) {
      return apiError(new Error('Job not found'), 404, 'Job not found');
    }

    // For completed jobs, fetch related resource
    let output = job.output_json;
    
    if ((job.status === 'completed' || job.status === 'done') && job.related_id) {
      switch (job.type) {
        case 'generate_avatar': {
          const { data: avatar } = await supabase
            .from('avatars')
            .select('id, image_url, turnaround_urls, thumbnail_url')
            .eq('id', job.related_id)
            .single();
          
          if (avatar) {
            output = { ...output, avatar };
          }
          break;
        }
        
        case 'train_voice': {
          const { data: voice } = await supabase
            .from('voice_profiles')
            .select('id, slot, name, status')
            .eq('id', job.related_id)
            .single();
          
          if (voice) {
            output = { ...output, voice };
          }
          break;
        }
        
        case 'talk_clip': {
          const { data: clip } = await supabase
            .from('talk_clips')
            .select('id, audio_url, video_url, duration_seconds')
            .eq('id', job.related_id)
            .single();
          
          if (clip) {
            output = { ...output, clip };
          }
          break;
        }
      }
    }

    return apiSuccess({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        progress: job.progress,
        output
      }
    });

  } catch (error) {
    return apiError(error, 500);
  }
}
