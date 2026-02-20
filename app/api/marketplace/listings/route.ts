import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';
import { getRequestKey, softRateLimit } from '@/lib/marketplace/rateLimit';
import type { MarketplaceListing } from '@/lib/marketplace/types';

export const dynamic = 'force-dynamic';

const listingCreateSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
  type: z.enum(['digital', 'service']),
  title: z.string().min(2).max(180),
  category: z.string().min(2).max(80),
  tags: z.array(z.string()).default([]),
  description: z.string().default(''),
  faq: z.array(z.object({ q: z.string().default(''), a: z.string().default('') })).default([]),
  media: z.array(z.string()).default([]),
  delivery: z.record(z.unknown()).default({}),
  pricing: z.record(z.unknown()).default({}),
  language: z.string().default('en'),
});

function parseRange(value: string | null) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.ip || 'unknown';
    const rl = softRateLimit(getRequestKey(ip, 'marketplace:listings:get'), 120, 60_000);
    if (!rl.allowed) {
      return apiError(new Error('Rate limit'), 429, 'Too many requests');
    }

    const user = await getAuthenticatedUser(request);
    const query = request.nextUrl.searchParams;
    const mine = query.get('mine') === '1';
    const q = query.get('q')?.trim();
    const category = query.get('category');
    const type = query.get('type');
    const language = query.get('language');
    const sort = query.get('sort') || 'newest';
    const minPrice = parseRange(query.get('min'));
    const maxPrice = parseRange(query.get('max'));
    const limit = Math.min(100, Math.max(1, Number(query.get('limit') || '24')));

    if (mine && !user) {
      return apiSuccess({ guest: true, listings: [] as MarketplaceListing[] });
    }

    const supabase = createServiceRoleClient();
    let dbQuery = supabase.from('marketplace_listings').select('*').limit(limit);

    if (mine && user) {
      dbQuery = dbQuery.eq('owner_id', user.id);
    } else if (!user) {
      dbQuery = dbQuery.eq('status', 'published');
    }

    if (category) dbQuery = dbQuery.eq('category', category);
    if (type === 'digital' || type === 'service') dbQuery = dbQuery.eq('type', type);
    if (language) dbQuery = dbQuery.eq('language', language);
    if (q) dbQuery = dbQuery.ilike('title', `%${q}%`);

    const { data, error } = await dbQuery.order(sort === 'oldest' ? 'created_at' : 'updated_at', {
      ascending: sort === 'oldest',
    });

    if (error) return apiError(error, 500, 'Failed to load listings');

    let listings = (data ?? []) as MarketplaceListing[];

    if (minPrice !== null || maxPrice !== null) {
      listings = listings.filter((listing) => {
        const amount = Number(listing.pricing?.amount ?? 0);
        if (minPrice !== null && amount < minPrice) return false;
        if (maxPrice !== null && amount > maxPrice) return false;
        return true;
      });
    }

    return apiSuccess({ guest: !user, listings });
  } catch (error) {
    return apiError(error, 500, 'Failed to load listings');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return apiError(new Error('Unauthorized'), 401, 'Login required to create listing');
    }

    const payload = listingCreateSchema.safeParse(await request.json());
    if (!payload.success) return apiError(payload.error, 400, 'Invalid listing payload');

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_listings')
      .insert({
        owner_id: user.id,
        ...payload.data,
        metrics: { views: 0, favorites: 0, inquiries: 0 },
      })
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create listing');
    }

    return apiSuccess({ listing: data as MarketplaceListing }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create listing');
  }
}
