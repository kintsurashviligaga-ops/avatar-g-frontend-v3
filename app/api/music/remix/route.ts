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
 * POST /api/music/remix
 * Create a remixed version of an existing track
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
    const { track_id, new_prompt, keep_vocals } = body;

    if (!track_id || !new_prompt) {
      return NextResponse.json(
        { error: 'track_id and new_prompt are required' },
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

    // Create new track as remix version
    const { data: remixTrack, error: createError } = await supabase
      .from('tracks')
      .insert([
        {
          user_id: user.id,
          title: `${originalTrack.title} (Remix)`,
          prompt: new_prompt,
          parent_track_id: track_id,
          genre: originalTrack.genre,
          mood: originalTrack.mood,
          language: originalTrack.language,
          use_custom_vocals: keep_vocals ? originalTrack.use_custom_vocals : false,
          voice_slots: keep_vocals ? originalTrack.voice_slots : [],
          status: 'processing'
        }
      ])
      .select()
      .single();

    if (createError) {
      return NextResponse.json(
        { error: 'Failed to create remix track' },
        { status: 500 }
      );
    }

    // Create job
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .insert([
        {
          user_id: user.id,
          type: 'remix_track',
          status: 'queued',
          input_json: {
            track_id: remixTrack.id,
            original_track_id: track_id,
            new_prompt,
            keep_vocals,
            original_audio_url: originalTrack.audio_url
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
      track_id: remixTrack.id,
      job_id: job?.id,
      message: 'Remix generation started'
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Remix failed' },
      { status: 500 }
    );
  }
}
