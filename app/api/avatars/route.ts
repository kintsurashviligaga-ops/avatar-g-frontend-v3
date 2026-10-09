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
    if ((url.searchParams?.get?.('health') ?? '') === '1') {
      return apiSuccess({
        status: 'ok',
        service: 'avatars-api',
      });
    }

    const supabase = getSupabaseClient();
    const authHeader = request.headers.get('authorization');
    // ⚠️ ONLY THE SESSION'S OWN ROWS. A `?owner_id=<uuid>` used to stand in for a missing session, and the query below
    // runs on the service role, so anyone could read another user's avatars — their voice id (a clone, after
    // PATCH /api/voice/clone sets a default), system prompt and image. The parameter is ignored now
    // (/api/avatars/latest was closed the same way in d24c69c7).
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

    if (!resolvedOwnerId) {
      return apiSuccess({
        avatars: [],
        total: 0,
        limit: 0,
        offset: 0,
      });
    }

    // Query parameters (url already defined above for health check)
    const limit = Math.min(Math.max(1, parseInt(url.searchParams?.get?.('limit') || '100') || 100), 500);
    const offset = Math.max(0, parseInt(url.searchParams?.get?.('offset') || '0') || 0);
    // Allowlist the sort column — it flows straight into .order(); an arbitrary/NaN value would 500 the query.
    const sortBy = ['created_at', 'title', 'updated_at'].includes(url.searchParams?.get?.('sort') || '') ? url.searchParams.get('sort')! : 'created_at';
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
