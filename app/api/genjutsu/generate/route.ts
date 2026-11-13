/**
 * app/api/genjutsu/generate — REMOVED with the VFX service (GG 2026-11-13). Answers 410 `service_removed` before anything else:
 * no auth, no quote, no charge, no Veo call. See lib/genjutsu/removed (GET /api/genjutsu/status stays: it is shared).
 */
import { vfxRemovedResponse } from '@/lib/genjutsu/removed';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  return vfxRemovedResponse();
}
