import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { MarketplaceFavorite, MarketplaceListing } from '@/lib/marketplace/types';

export const dynamic = 'force-dynamic';

const toggleSchema = z.object({ listing_id: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiSuccess({ guest: true, favorites: [] as MarketplaceFavorite[], listings: [] as MarketplaceListing[] });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_favorites')
      .select('id,user_id,listing_id,created_at, marketplace_listings(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return apiError(error, 500, 'Failed to load favorites');

    const favorites = (data ?? []).map((row) => ({
      id: row.id,
      user_id: row.user_id,
      listing_id: row.listing_id,
      created_at: row.created_at,
    })) as MarketplaceFavorite[];

    const listings = (data ?? [])
      .map((row) => row.marketplace_listings)
      .filter(Boolean) as unknown as MarketplaceListing[];

    return apiSuccess({ guest: false, favorites, listings });
  } catch (error) {
    return apiError(error, 500, 'Failed to load favorites');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const payload = toggleSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid favorite payload');

    const supabase = createServiceRoleClient();

    const { data: existing, error: existingError } = await supabase
      .from('marketplace_favorites')
      .select('id')
      .eq('user_id', user.id)
      .eq('listing_id', payload.data.listing_id)
      .maybeSingle();

    if (existingError) return apiError(existingError, 500, 'Failed to toggle favorite');

    if (existing) {
      const { error } = await supabase
        .from('marketplace_favorites')
        .delete()
        .eq('id', existing.id)
        .eq('user_id', user.id);

      if (error) return apiError(error, 500, 'Failed to remove favorite');
      return apiSuccess({ favorited: false });
    }

    const { error } = await supabase
      .from('marketplace_favorites')
      .insert({ user_id: user.id, listing_id: payload.data.listing_id });

    if (error) return apiError(error, 500, 'Failed to add favorite');
    return apiSuccess({ favorited: true }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to toggle favorite');
  }
}
