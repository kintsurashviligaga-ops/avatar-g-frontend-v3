/**
 * GET /api/avatars/latest
 * Fetch the latest avatar for a user (authenticated or anonymous)
 * 
 * Query params:
 * - owner_id: Required. User ID (auth) or anonymous UUID
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
    if (rateLimitError) return rateLimitError;

    const { searchParams } = new URL(request.url);
    const ownerId = searchParams?.get?.('owner_id');
    if (!ownerId) {
      return apiSuccess({ avatar: null });
    }

    // Get Supabase service role client (server-side only)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let data = null;
    try {
      const result = await supabase
        .from('avatars')
        .select('*')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      data = result.data || null;
    } catch (dbError) {
      // Log error but never crash endpoint
      console.error('[avatars/latest] DB error:', dbError);
      data = null;
    }

    return apiSuccess({ avatar: data });
  } catch (error) {
    // Log error but never crash endpoint
    console.error('[avatars/latest] Handler error:', error);
    return apiSuccess({ avatar: null });
  }
}
