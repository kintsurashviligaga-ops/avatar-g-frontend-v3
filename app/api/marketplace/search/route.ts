import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get('q')?.trim();
    if (!q || q.length < 2) {
      return apiSuccess({ suggestions: [] as Array<{ id: string; title: string; category: string; tags: string[] }> });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('marketplace_listings')
      .select('id,title,category,tags,status')
      .eq('status', 'published')
      .ilike('title', `%${q}%`)
      .limit(8);

    if (error) return apiError(error, 500, 'Failed to search listings');

    const suggestions = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      tags: Array.isArray(row.tags) ? row.tags : [],
    }));

    return apiSuccess({ suggestions });
  } catch (error) {
    return apiError(error, 500, 'Failed to search listings');
  }
}
