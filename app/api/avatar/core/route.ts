import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/api/response';
import { requireUser } from '@/lib/supabase/server';
import { isTwinEnabled } from '@/lib/twin/flag';
import { resolveCorePoster } from '@/lib/twin/resolve';

export const dynamic = 'force-dynamic';

/**
 * GET /api/avatar/core — the user's core Live-Avatar poster. STORAGE-FIRST: reads the deterministic selfie
 * object written by enrollment (the source of truth), so it works even though the avatar_assets table +
 * profiles.core_avatar_id columns are NOT provisioned in prod. Returns the poster URL (cache-busted by the
 * object's updated_at, so a re-enroll is detected by the desktop→phone handoff poll). Shape is unchanged:
 * { poster_url, status, updated_at, ... } — GeminiLiveConversation + the handoff poll read those fields.
 *
 * ⚠️ TWIN FIRST (NEXT_PUBLIC_TWIN_ENABLED): the poster is the Digital Twin's FRONT photo as a short-lived SIGNED url,
 * updated_at its commit time; without a twin it is the legacy public poster exactly as before (lib/twin/resolve.ts).
 */
export async function GET(_request: NextRequest) {
  try {
    const user = await requireUser();

    let poster: Awaited<ReturnType<typeof resolveCorePoster>> = null;
    try {
      poster = await resolveCorePoster(user.id, { twin: isTwinEnabled() });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[avatar/core] storage read failed:', e instanceof Error ? e.message : e);
    }

    return apiSuccess({
      core_avatar_id: null,
      status: poster ? 'ready' : 'none',
      model_glb_url: null,
      poster_url: poster?.url ?? null,
      updated_at: poster?.updatedAt ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return apiError(error, 401, 'Unauthorized');
    }
    return apiError(error, 500, 'Failed to fetch core avatar');
  }
}
