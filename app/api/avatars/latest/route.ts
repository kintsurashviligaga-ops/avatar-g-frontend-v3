/**
 * GET /api/avatars/latest
 * Fetch the latest avatar for a user (authenticated or anonymous)
 * 
 * Query params:
 * - owner_id: Required. User ID (auth) or anonymous UUID
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
    if (rateLimitError) return rateLimitError;

    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('owner_id');
    
    if (!ownerId) {
      return apiError(new Error('owner_id is required'), 400, 'owner_id query param is required');
    }
    
    // Get Supabase service role client (server-side only)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Query latest avatar for this owner
    const { data, error } = await supabase
      .from('avatars')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (error) {
      return apiError(error, 500, 'Failed to fetch avatar');
    }

    return apiSuccess({
      success: true,
      avatar: data || null,
    });
  } catch (error) {
    return apiError(error, 500, 'Failed to fetch avatar');
  }
}
