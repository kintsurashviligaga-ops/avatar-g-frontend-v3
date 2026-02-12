import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
 * POST /api/music/extend
 * Extend an existing track to a longer duration
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { track_id, target_duration } = body;

    if (!track_id || !target_duration) {
      return NextResponse.json(
        { error: 'track_id and target_duration are required' },
        { status: 400 }
      );
    }

    if (target_duration < 60 || target_duration > 600) {
      return NextResponse.json(
        { error: 'target_duration must be between 60 and 600 seconds' },
        { status: 400 }
      );
    }

    // Fetch original track
    const { data: originalTrack, error: trackError } = await supabase
      .from('tracks')
      .select('*')
      .eq('id', track_id)
      .eq('user_id', user.id)
      .single();

    if (trackError || !originalTrack) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    if (!originalTrack.audio_url) {
      return NextResponse.json(
        { error: 'Source track has no audio' },
        { status: 400 }
      );
    }

    if (target_duration <= (originalTrack.duration || 180)) {
      return NextResponse.json(
        { error: 'Target duration must be longer than original track' },
        { status: 400 }
      );
    }

    // Create extended version track
    const { data: extendedTrack, error: createError } = await supabase
      .from('tracks')
      .insert([
        {
          user_id: user.id,
          title: `${originalTrack.title} (Extended)`,
          prompt: originalTrack.prompt,
          parent_track_id: track_id,
          genre: originalTrack.genre,
          mood: originalTrack.mood,
          language: originalTrack.language,
          duration: target_duration,
          status: 'processing'
        }
      ])
      .select()
      .single();

    if (createError) {
      return NextResponse.json(
        { error: 'Failed to create extended track' },
        { status: 500 }
      );
    }

    // Create job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert([
        {
          user_id: user.id,
          type: 'extend_track',
          status: 'queued',
          input_json: {
            track_id: extendedTrack.id,
            original_track_id: track_id,
            original_audio_url: originalTrack.audio_url,
            target_duration
          },
          progress: 0
        }
      ])
      .select()
      .single();

    if (jobError) {
      return NextResponse.json(
        { error: 'Failed to create job' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      track_id: extendedTrack.id,
      job_id: job?.id,
      message: 'Track extension started'
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Extend failed' },
      { status: 500 }
    );
  }
}
