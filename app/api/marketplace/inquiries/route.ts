import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { MarketplaceInquiry } from '@/lib/marketplace/types';

export const dynamic = 'force-dynamic';

const inquirySchema = z.object({
  listing_id: z.string().uuid(),
  subject: z.string().min(2).max(220),
  message: z.string().min(2).max(2000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiSuccess({ guest: true, inquiries: [] as MarketplaceInquiry[] });

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_inquiries')
      .select('*')
      .or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return apiError(error, 500, 'Failed to load inquiries');
    return apiSuccess({ guest: false, inquiries: (data ?? []) as MarketplaceInquiry[] });
  } catch (error) {
    return apiError(error, 500, 'Failed to load inquiries');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const payload = inquirySchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid inquiry payload');

    const supabase = createServiceRoleClient();
    const { data: listing, error: listingError } = await supabase
      .from('marketplace_listings')
      .select('id,owner_id,status')
      .eq('id', payload.data.listing_id)
      .maybeSingle();

    if (listingError) return apiError(listingError, 500, 'Failed to validate listing');
    if (!listing || listing.status !== 'published') return apiError(new Error('Not found'), 404, 'Listing unavailable');

    const { data: inquiry, error: inquiryError } = await supabase
      .from('marketplace_inquiries')
      .insert({
        listing_id: payload.data.listing_id,
        buyer_id: user.id,
        seller_id: listing.owner_id,
        subject: payload.data.subject,
        status: 'open',
      })
      .select('*')
      .single();

    if (inquiryError || !inquiry) {
      return apiError(inquiryError ?? new Error('Insert failed'), 500, 'Failed to create inquiry');
    }

    if (payload.data.message?.trim()) {
      await supabase.from('marketplace_messages').insert({
        inquiry_id: inquiry.id,
        sender_id: user.id,
        body: payload.data.message,
      });
    }

    return apiSuccess({ inquiry }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create inquiry');
  }
}
