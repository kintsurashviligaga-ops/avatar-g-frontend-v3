// GET /api/videos - List user's generated videos

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { VideoClip } from '@/types/platform';

export const dynamic = 'force-dynamic';

const getSupabaseClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase env vars are missing');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
};

export async function GET(request: NextRequest) {
  try {
    // Health check endpoint
    const url = new URL(request.url);
    if (url.searchParams.get('health') === '1') {
      return NextResponse.json({
        status: 'ok',
        service: 'videos-api',
        timestamp: new Date().toISOString(),
      });
    }

    const supabase = getSupabaseClient();
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

    // Query parameters (url already defined above for health check)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const status = url.searchParams.get('status');
    const favorites = url.searchParams.get('favorites') === 'true';

    let query = supabase
      .from('video_clips')
      .select('*', { count: 'exact' })
      .eq('user_id', data.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    if (favorites) {
      query = query.eq('is_favorite', true);
    }

    const { data: videos, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch videos' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      videos: videos as VideoClip[],
      total: count || 0,
      limit,
      offset
    });
  } catch (err) {
    console.error('Error fetching videos:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
