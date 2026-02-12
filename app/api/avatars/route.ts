// GET /api/avatars - List user's saved avatars

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';

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
      return apiSuccess({
        status: 'ok',
        service: 'avatars-api',
      });
    }

    const supabase = getSupabaseClient();
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return apiError(new Error('Unauthorized'), 401, 'Missing or invalid authorization');
    }

    const token = authHeader.slice(7);
    const { data, error: authError } = await supabase.auth.getUser(token);

    if (authError || !data.user) {
      return apiError(new Error('Unauthorized'), 401, 'Unauthorized');
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
      .eq('owner_id', data.user.id)
      .order(sortBy, { ascending: sortDir === 'asc' })
      .range(offset, offset + limit - 1);

    const { data: avatars, error, count } = await query;

    if (error) {
      return apiError(error, 500, 'Failed to fetch avatars');
    }

    return apiSuccess({
      avatars: avatars || [],
      total: count || 0,
      limit,
      offset
    });
  } catch (err) {
    return apiError(err, 500);
  }
}
