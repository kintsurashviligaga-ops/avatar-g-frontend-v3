import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { requireUser } from '@/lib/supabase/server';
import { deleteLiveAvatar, describeLiveAvatar, resolveLiveAvatar, type LiveAvatarView } from '@/lib/avatar/liveAvatar';
import { isTwinEnabled } from '@/lib/twin/flag';
import { resolveTwinFace } from '@/lib/twin/resolve';
import { twinStorageClient } from '@/lib/twin/store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/avatar/core — the user's core Live-Avatar photo. Shape kept for older readers
 * ({ core_avatar_id, status, poster_url, updated_at, model_glb_url }) plus `live_avatar` (id, state, prep, signed URL).
 *
 * ⚠️ PRIVATE (2026-10-24, the owner's P0 correction task, phase 2): the photo is the user's saved Live Avatar in the
 * private `twins` bucket (lib/avatar/liveAvatar.ts), handed out as a short-lived SIGNED url; `core_avatar_id` is its
 * stable id. The old PUBLIC poster is moved in on its owner's first read and the public file removed — it is never
 * served again. With NEXT_PUBLIC_TWIN_ENABLED and no Live Avatar, the Digital Twin's front photo is the fallback.
 *
 * DELETE /api/avatar/core — removes the Live Avatar (photo, portrait, the legacy public poster). The voice sample and
 * the Digital Twin have their own delete (DELETE /api/twin).
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await requireUser();

    let live: LiveAvatarView | null = null;
    let poster: { url: string; updatedAt: string | null } | null = null;
    try {
      const sb = twinStorageClient();
      const manifest = await resolveLiveAvatar(sb, user.id);
      if (manifest) {
        live = await describeLiveAvatar(sb, manifest);
        poster = { url: live.photoUrl, updatedAt: live.updatedAt };
      } else if (isTwinEnabled()) {
        poster = await resolveTwinFace(user.id, sb);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[avatar/core] storage read failed:', e instanceof Error ? e.message : e);
      return apiError(e, 503, 'Avatar storage unavailable');
    }

    return apiSuccess({
      core_avatar_id: live?.id ?? null,
      status: poster ? 'ready' : 'none',
      model_glb_url: null,
      poster_url: poster?.url ?? null,
      updated_at: poster?.updatedAt ?? null,
      live_avatar: live,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to fetch core avatar');
  }
}

export async function DELETE(_request: NextRequest) {
  try {
    const user = await requireUser();
    try {
      await deleteLiveAvatar(twinStorageClient(), user.id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[avatar/core] delete failed:', e instanceof Error ? e.message : e);
      return apiError(e, 503, 'Avatar storage unavailable');
    }
    return apiSuccess({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to delete avatar');
  }
}
