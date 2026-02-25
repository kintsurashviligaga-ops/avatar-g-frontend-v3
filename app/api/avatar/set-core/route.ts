import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const setCoreSchema = z.object({
  avatarAssetId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const payload = setCoreSchema.safeParse(await request.json());

    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid set-core payload');
    }

    const supabase = createServiceRoleClient();
    const { data: asset, error: assetError } = await supabase
      .from('avatar_assets')
      .select('id, status')
      .eq('id', payload.data.avatarAssetId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (assetError || !asset) {
      return apiError(assetError ?? new Error('Asset not found'), 404, 'Avatar asset not found');
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        core_avatar_id: asset.id,
        avatar_status: asset.status,
        avatar_updated_at: new Date().toISOString(),
      });

    if (profileError) {
      return apiError(profileError, 500, 'Failed to set core avatar');
    }

    return apiSuccess({ ok: true, core_avatar_id: asset.id, status: asset.status });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to set core avatar');
  }
}
