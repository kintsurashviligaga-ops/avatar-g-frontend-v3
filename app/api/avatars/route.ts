// GET /api/avatars - List user's saved avatars

import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if ((url.searchParams?.get?.('health') ?? '') === '1') {
      return apiSuccess({
        status: 'ok',
        service: 'avatars-api',
      });
    }

    const supabase = getSupabaseClient();
    const authHeader = request.headers.get('authorization');
    const ownerIdParam = url.searchParams?.get?.('owner_id')?.trim() || null;
    let resolvedOwnerId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      if (token) {
        const { data, error: authError } = await supabase.auth.getUser(token);
        if (!authError && data.user?.id) {
          resolvedOwnerId = data.user.id;
        }
      }
    }

    if (!resolvedOwnerId && ownerIdParam) {
      if (!UUID_RE.test(ownerIdParam)) {
        return apiSuccess({
          avatars: [],
          total: 0,
          limit: 0,
          offset: 0,
        });
      }

      resolvedOwnerId = ownerIdParam;
    }

    if (!resolvedOwnerId) {
      return apiSuccess({
        avatars: [],
        total: 0,
        limit: 0,
        offset: 0,
      });
    }

    // Query parameters (url already defined above for health check)
    const limit = Math.min(parseInt(url.searchParams?.get?.('limit') || '100'), 500);
    const offset = parseInt(url.searchParams?.get?.('offset') || '0');
    const sortBy = url.searchParams?.get?.('sort') || 'created_at'; // created_at, title, updated_at
    const sortDir = url.searchParams?.get?.('dir') || 'desc'; // asc, desc

    // Build query
    const query = supabase
      .from('avatars')
      .select('*', { count: 'exact' })
      .eq('owner_id', resolvedOwnerId)
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
