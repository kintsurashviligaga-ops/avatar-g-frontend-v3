// GET /api/avatars - List user's saved avatars

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { Avatar } from '@/types/platform';

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
        service: 'avatars-api',
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
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0');
    const sortBy = url.searchParams.get('sort') || 'created_at'; // created_at, title, updated_at
    const sortDir = url.searchParams.get('dir') || 'desc'; // asc, desc

    // Build query
    const query = supabase
      .from('avatars')
      .select('*', { count: 'exact' })
      .eq('user_id', data.user.id)
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: avatars, error, count } = await query;

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to fetch avatars' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      avatars: avatars as Avatar[],
      total: count || 0,
      limit,
      offset
    });
  } catch (err) {
    console.error('Error in get avatars:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
