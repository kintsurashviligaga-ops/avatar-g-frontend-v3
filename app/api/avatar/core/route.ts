import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { createServiceRoleClient, requireUser } from '@/lib/supabase/server';
import { LIVE_AVATAR_BUCKET, liveAvatarPath } from '@/lib/avatar/enroll';

export const dynamic = 'force-dynamic';

/**
 * GET /api/avatar/core — the user's core Live-Avatar poster. STORAGE-FIRST: reads the deterministic selfie
 * object written by enrollment (the source of truth), so it works even though the avatar_assets table +
 * profiles.core_avatar_id columns are NOT provisioned in prod. Returns the poster URL (cache-busted by the
 * object's updated_at, so a re-enroll is detected by the desktop→phone handoff poll). Shape is unchanged:
 * { poster_url, status, updated_at, ... } — GeminiLiveConversation + the handoff poll read those fields.
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await requireUser();

    let posterUrl: string | null = null;
    let updatedAt: string | null = null;
    try {
      const svc = createServiceRoleClient();
      const { data: files } = await svc.storage
        .from(LIVE_AVATAR_BUCKET)
        .list(`live-avatars/${user.id}`, { limit: 10 });
      const poster = files?.find((f) => f.name === 'poster.jpg');
      if (poster) {
        const base = svc.storage.from(LIVE_AVATAR_BUCKET).getPublicUrl(liveAvatarPath(user.id)).data.publicUrl;
        updatedAt = poster.updated_at || poster.created_at || null;
        const v = updatedAt ? new Date(updatedAt).getTime() : Date.now();
        posterUrl = `${base}?v=${v}`;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[avatar/core] storage read failed:', e instanceof Error ? e.message : e);
    }

    return apiSuccess({
      core_avatar_id: null,
      status: posterUrl ? 'ready' : 'none',
      model_glb_url: null,
      poster_url: posterUrl,
      updated_at: updatedAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to fetch core avatar');
  }
}
