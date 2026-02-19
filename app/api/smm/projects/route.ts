import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveSmmOwnerContext } from '@/lib/smm/server';

export const dynamic = 'force-dynamic';

const projectSchema = z.object({
  title: z.string().min(2).max(180),
  goal: z.enum(['grow_followers', 'sell_product', 'build_brand', 'announce_event', 'recruit', 'tourism_promo']),
  audience_lang: z.enum(['ka', 'en', 'ru']),
  platforms: z.array(z.string()).min(1),
  brand_voice: z.enum(['luxury', 'friendly', 'corporate', 'noir', 'energetic']),
});

export async function GET(request: NextRequest) {
  try {
    const owner = await resolveSmmOwnerContext(request);
    if (!owner) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('smm_projects')
      .select('*')
      .eq('owner_id', owner.ownerId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return apiError(error, 500, 'Failed to load projects');
    }

    return apiSuccess({ projects: data ?? [], mode: owner.isDemo ? 'demo' : 'auth' });
  } catch (error) {
    return apiError(error, 500, 'Failed to load projects');
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = await resolveSmmOwnerContext(request);
    if (!owner) {
      return apiError(new Error('Unauthorized'), 401, 'Login required');
    }

    const payload = projectSchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid project payload');
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('smm_projects')
      .insert({
        owner_id: owner.ownerId,
        title: payload.data.title,
        goal: payload.data.goal,
        audience_lang: payload.data.audience_lang,
        platforms: payload.data.platforms,
        brand_voice: payload.data.brand_voice,
      })
      .select('*')
      .single();

    if (error || !data) {
      return apiError(error ?? new Error('Insert failed'), 500, 'Failed to create project');
    }

    return apiSuccess({ project: data, mode: owner.isDemo ? 'demo' : 'auth' }, 201);
  } catch (error) {
    return apiError(error, 500, 'Failed to create project');
  }
}
