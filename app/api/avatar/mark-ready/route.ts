import { NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const markReadySchema = z.object({
  avatarAssetId: z.string().uuid(),
  model_glb_url: z.string().url(),
  poster_url: z.string().url(),
  meta: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  try {
    const payload = markReadySchema.safeParse(await request.json());
    if (!payload.success) {
      return apiError(payload.error, 400, 'Invalid mark-ready payload');
    }

    const internalKey = request.headers.get('x-internal-key');
    const envInternalKey = process.env.INTERNAL_API_KEY;
    const isInternal = Boolean(envInternalKey && internalKey && internalKey === envInternalKey);

    let requesterUserId: string | null = null;
    if (!isInternal) {
      try {
        requesterUserId = (await requireUser()).id;
      } catch {
        return apiError(new Error('Unauthorized'), 401, 'Unauthorized');
      }
    }

    const supabase = createServiceRoleClient();
    const { data: targetAsset, error: targetAssetError } = await supabase
      .from('avatar_assets')
      .select('id, user_id')
      .eq('id', payload.data.avatarAssetId)
      .maybeSingle();

    if (targetAssetError || !targetAsset) {
      return apiError(targetAssetError ?? new Error('Asset not found'), 404, 'Avatar asset not found');
    }

    if (!isInternal && requesterUserId !== targetAsset.user_id) {
      return apiError(new Error('Forbidden'), 403, 'Access denied');
    }

    const { error: updateAssetError } = await supabase
      .from('avatar_assets')
      .update({
        status: 'ready',
        model_glb_url: payload.data.model_glb_url,
        poster_url: payload.data.poster_url,
        meta: payload.data.meta,
        error_message: null,
      })
      .eq('id', payload.data.avatarAssetId);

    if (updateAssetError) {
      return apiError(updateAssetError, 500, 'Failed to mark avatar asset as ready');
    }

    const { error: updateProfileError } = await supabase
      .from('profiles')
      .upsert({
        id: targetAsset.user_id,
        avatar_status: 'ready',
        avatar_updated_at: new Date().toISOString(),
      });

    if (updateProfileError) {
      return apiError(updateProfileError, 500, 'Failed to update profile avatar status');
    }

    return apiSuccess({ ok: true });
  } catch (error) {
    return apiError(error, 500, 'Failed to mark avatar asset as ready');
  }
}
