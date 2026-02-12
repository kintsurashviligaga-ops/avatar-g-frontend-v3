// POST /api/video/generate - Generate a video from avatar + track + prompt

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { VideoJobRequestSchema, validateInput } from '@/lib/api/validation';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import type { GenerateVideoRequest, Job } from '@/types/platform';

export const dynamic = 'force-dynamic';

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase env vars are missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

export async function POST(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  try {
    const supabase = getSupabaseClient();
    // Auth validation
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const { data, error: authError } = await supabase.auth.getUser(token);

    if (authError || !data.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = data.user.id;

    // Parse and validate input
    const body: GenerateVideoRequest = await request.json();
    const validation = validateInput(VideoJobRequestSchema, body);

    if (!validation.success) {
      return apiError(new Error(validation.error), 400, 'Invalid request');
    }

    const input = validation.data;

    if (!input.track_id && !input.prompt) {
      return apiError(new Error('Missing track_id or prompt'), 400, 'Invalid request');
    }

    // Verify avatar exists and belongs to user
    const { data: avatar, error: avatarError } = await supabase
      .from('avatars')
      .select('id')
      .eq('id', input.avatar_id)
      .eq('user_id', userId)
      .single();

    if (avatarError || !avatar) {
      return NextResponse.json(
        { error: 'Avatar not found' },
        { status: 404 }
      );
    }

    // Verify track if provided
    if (input.track_id) {
      const { data: track, error: trackError } = await supabase
        .from('tracks')
        .select('id, duration_seconds, audio_url, title')
        .eq('id', input.track_id)
        .eq('user_id', userId)
        .single();

      if (trackError || !track) {
        return NextResponse.json(
          { error: 'Track not found' },
          { status: 404 }
        );
      }
    }

    // Create video clip record
    const videoTitle = input.title || `Video ${new Date().toLocaleDateString('ka-KA')}`;
    const { data: videoClip, error: videoError } = await supabase
      .from('video_clips')
      .insert({
        user_id: userId,
        title: videoTitle,
        prompt: input.prompt,
        avatar_id: input.avatar_id,
        track_id: input.track_id,
        video_mode: input.video_mode || 'avatar_performance',
        avatar_action: input.avatar_action,
        enable_lip_sync: input.enable_lip_sync || false,
        camera_template: input.camera_template || 'static',
        lighting_style: input.lighting_style || 'studio',
        resolution: input.resolution || '1080p',
        aspect_ratio: input.aspect_ratio || '16:9',
        fps: 30,
        status: 'queued',
        progress: 0,
        provider: 'worker'
      })
      .select()
      .single();

    if (videoError) {
      return apiError(videoError, 500, 'Failed to create video clip');
    }

    // Create job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert({
        user_id: userId,
        type: 'generate_video',
        status: 'queued',
        progress: 0,
        video_clip_id: videoClip.id,
        input_json: input
      })
      .select()
      .single();

    if (jobError) {
      return apiError(jobError, 500, 'Failed to create job');
    }

    return apiSuccess({
      video: videoClip,
      job: job as Job
    });
  } catch (err) {
    return apiError(err, 500);
  }
}
