import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import type { MarketplaceListing } from '@/lib/marketplace/types';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
  type: z.enum(['digital', 'service']).optional(),
  title: z.string().min(2).max(180).optional(),
  category: z.string().min(2).max(80).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  faq: z.array(z.object({ q: z.string().default(''), a: z.string().default('') })).optional(),
  media: z.array(z.string()).optional(),
  delivery: z.record(z.unknown()).optional(),
  pricing: z.record(z.unknown()).optional(),
  language: z.string().optional(),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (error) return apiError(error, 500, 'Failed to load listing');
    if (!data) return apiSuccess({ listing: null });

    const listing = data as MarketplaceListing;
    if (listing.status !== 'published' && user?.id !== listing.owner_id) {
      return apiSuccess({ listing: null });
    }

    return apiSuccess({ listing });
  } catch (error) {
    return apiError(error, 500, 'Failed to load listing');
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const payload = patchSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid listing update payload');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_listings')
      .update({ ...payload.data, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .eq('owner_id', user.id)
      .select('*')
      .maybeSingle();

    if (error) return apiError(error, 500, 'Failed to update listing');
    if (!data) return apiError(new Error('Not found'), 404, 'Listing not found');

    return apiSuccess({ listing: data as MarketplaceListing });
  } catch (error) {
    return apiError(error, 500, 'Failed to update listing');
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return apiError(new Error('Unauthorized'), 401, 'Login required');

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from('marketplace_listings')
      .delete()
      .eq('id', params.id)
      .eq('owner_id', user.id);

    if (error) return apiError(error, 500, 'Failed to delete listing');
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to delete listing');
  }
}
