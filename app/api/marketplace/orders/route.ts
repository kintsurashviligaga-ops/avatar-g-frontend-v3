import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { MarketplaceOrder } from '@/lib/marketplace/types';

export const dynamic = 'force-dynamic';

const createOrderSchema = z.object({ listing_id: z.string().uuid() });

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiSuccess({ guest: true, orders: [] as MarketplaceOrder[] });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_orders')
      .select('*')
      .eq('buyer_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return apiError(error, 500, 'Failed to load orders');
    return apiSuccess({ guest: false, orders: (data ?? []) as MarketplaceOrder[] });
  } catch (error) {
    return apiError(error, 500, 'Failed to load orders');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const payload = createOrderSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid order payload');

    const supabase = createServiceRoleClient();
    const { data: listing, error: listingError } = await supabase
      .from('marketplace_listings')
      .select('id, status, pricing')
      .eq('id', payload.data.listing_id)
      .maybeSingle();

    if (listingError) return apiError(listingError, 500, 'Failed to validate listing');
    if (!listing || listing.status !== 'published') return apiError(new Error('Not found'), 404, 'Listing unavailable');

    const pricing = (listing.pricing || {}) as { amount?: number; currency?: string };

    const { data, error } = await supabase
      .from('marketplace_orders')
      .insert({
        buyer_id: user.id,
        listing_id: payload.data.listing_id,
        status: 'test',
        amount: Number(pricing.amount || 0),
        currency: String(pricing.currency || 'USD'),
      })
      .select('*')
      .single();

    if (error || !data) return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create test order');
    return apiSuccess({ order: data as MarketplaceOrder }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create test order');
  }
}
