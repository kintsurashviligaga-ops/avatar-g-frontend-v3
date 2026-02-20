import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const metricsSchema = z.object({
  listing_id: z.string().uuid(),
  event: z.enum(['view', 'favorite', 'inquiry']),
});

export async function POST(request: NextRequest) {
  try {
    const payload = metricsSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid metrics payload');

    const supabase = createServiceRoleClient();
    const { data: listing, error: listingError } = await supabase
      .from('marketplace_listings')
      .select('id,metrics')
      .eq('id', payload.data.listing_id)
      .maybeSingle();

    if (listingError || !listing) return apiError(listingError ?? new Error('Not found'), 404, 'Listing not found');

    const current = (listing.metrics || {}) as { views?: number; favorites?: number; inquiries?: number };
    const next = {
      views: Number(current.views || 0),
      favorites: Number(current.favorites || 0),
      inquiries: Number(current.inquiries || 0),
    };

    if (payload.data.event === 'view') next.views += 1;
    if (payload.data.event === 'favorite') next.favorites += 1;
    if (payload.data.event === 'inquiry') next.inquiries += 1;

    const { error } = await supabase
      .from('marketplace_listings')
      .update({ metrics: next, updated_at: new Date().toISOString() })
      .eq('id', payload.data.listing_id);

    if (error) return apiError(error, 500, 'Failed to update listing metrics');
    return apiSuccess({ metrics: next });
  } catch (error) {
    return apiError(error, 500, 'Failed to update listing metrics');
  }
}
