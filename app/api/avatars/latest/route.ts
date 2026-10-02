/**
 * GET /api/avatars/latest
 * Fetch the latest avatar of the SIGNED-IN user.
 *
 * ⚠️ IDOR: this read ANY user's latest avatar row (`select *`, through the service-role client) for whatever
 * `owner_id` the query named, with no session at all. Now the owner is the verified session user; a query
 * `owner_id` naming someone else is refused, and a signed-out caller gets `{ avatar: null }`.
 */

import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiError, apiSuccess } from '@/lib/api/response';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const rateLimitError = await checkRateLimit(request, RATE_LIMITS.READ);
    if (rateLimitError) return rateLimitError;

    let sessionUserId: string | null = null;
    try {
      sessionUserId = (await authedClientFromRequest(request)).user?.id ?? null;
    } catch {
      sessionUserId = null;
    }
    if (!sessionUserId) return apiSuccess({ avatar: null });

    const { searchParams } = new URL(request.url);
    const requested = searchParams?.get?.('owner_id');
    if (requested && requested !== sessionUserId) {
      return apiError(new Error('Forbidden'), 403, 'Access denied');
    }
    const ownerId = sessionUserId;

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
