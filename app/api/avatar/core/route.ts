import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServerClient, getProfile, requireUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type CoreAvatarProfile = {
  core_avatar_id: string | null;
  avatar_status: 'none' | 'processing' | 'ready' | 'failed' | null;
  avatar_updated_at: string | null;
};

type CoreAvatarAsset = {
  status: 'none' | 'processing' | 'ready' | 'failed';
  model_glb_url: string | null;
  poster_url: string | null;
  updated_at: string;
};

export async function GET(_request: NextRequest) {
  try {
    const user = await requireUser();
    const profile = (await getProfile(user.id)) as CoreAvatarProfile | null;

    if (!profile?.core_avatar_id) {
      return apiSuccess({
        core_avatar_id: null,
        status: profile?.avatar_status ?? 'none',
        model_glb_url: null,
        poster_url: null,
        updated_at: profile?.avatar_updated_at ?? null,
      });
    }

    const supabase = createServerClient();
    const { data: asset, error } = await supabase
      .from('avatar_assets')
      .select('status, model_glb_url, poster_url, updated_at')
      .eq('id', profile.core_avatar_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      return apiError(error, 500, 'Failed to fetch core avatar');
    }

    if (!asset) {
      return apiSuccess({
        core_avatar_id: profile.core_avatar_id,
        status: profile.avatar_status ?? 'none',
        model_glb_url: null,
        poster_url: null,
        updated_at: profile.avatar_updated_at ?? null,
      });
    }

    const typedAsset = asset as CoreAvatarAsset;
    return apiSuccess({
      core_avatar_id: profile.core_avatar_id,
      status: typedAsset.status,
      model_glb_url: typedAsset.model_glb_url,
      poster_url: typedAsset.poster_url,
      updated_at: typedAsset.updated_at,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to fetch core avatar');
  }
}
