import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiError, apiSuccess } from '@/lib/api/response';
import { MusicTrackRequestSchema, validateInput } from '@/lib/api/validation';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import type { GenerateTrackRequest } from '@/types/music-video';

export const dynamic = 'force-dynamic';

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase env vars are missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

/**
 * POST /api/music/generate
 * Create a new music track from a prompt
 *
 * Request body:
 * {
 *   prompt: string;
 *   lyrics?: string;
 *   lyrics_mode?: 'auto' | 'custom' | 'instrumental';
 *   genre?: string;
 *   mood?: string;
 *   language?: 'ka' | 'en' | 'ru' | 'instrumental';
 *   style_tags?: string[];
 *   use_custom_vocals?: boolean;
 *   voice_slots?: ('A' | 'B' | 'C')[];
 * }
 */
export async function POST(request: NextRequest) {
  const rateLimitError = await checkRateLimit(request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  try {
    const supabase = getSupabaseClient();
    // 1. Authenticate user
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Missing or invalid authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Parse & validate request
    const body: GenerateTrackRequest = await request.json();
    const validation = validateInput(MusicTrackRequestSchema, body);

    if (!validation.success) {
      return apiError(new Error(validation.error), 400, 'Invalid request');
    }

    const input = validation.data;

    // 3. Create track record in database
    const { data: track, error: trackError } = await supabase
      .from('tracks')
      .insert([
        {
          user_id: user.id,
          title: input.prompt.substring(0, 100),
          description: input.prompt,
          prompt: input.prompt,
          lyrics: input.lyrics || null,
          lyrics_mode: input.lyrics_mode || 'auto',
          genre: input.genre || 'pop',
          mood: input.mood || 'energetic',
          language: input.language || 'ka',
          use_custom_vocals: input.use_custom_vocals || false,
          voice_slots: input.voice_slots || ['A'],
          style_tags: input.style_tags || [],
          status: 'queued' as const,
          audio_url: null,
          cover_url: null,
          waveform_data: [],
          duration: 0,
          bpm: 120,
          key: 'C',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (trackError) {
      return apiError(trackError, 500, 'Failed to create track record');
    }

    // 4. Create async job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert([
        {
          user_id: user.id,
          type: 'generate_track',
          status: 'queued',
          input_json: {
            track_id: track.id,
            ...input
          },
          output_json: null,
          progress: 0,
          error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (jobError) {
      return apiError(jobError, 500, 'Failed to create job');
    }

    // 5. Return immediate response (worker will process)
    return apiSuccess({
      track: {
        id: track.id,
        title: track.title,
        status: 'queued'
      },
      job: {
        id: job.id,
        status: 'queued'
      }
    });
  } catch (error) {
    return apiError(error, 500);
  }
}
