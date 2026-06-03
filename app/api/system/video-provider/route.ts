/**
 * app/api/system/video-provider/route.ts
 * =======================================
 * Tiny, names-only provider-readiness probe for the studio settings drawer's
 * status dot. Returns whether the video render path can fire (LTX alias OR the
 * Replicate failover token) without ever exposing a secret value.
 *
 *   GET /api/system/video-provider → { ready, ltx, replicate, checkedEnv }
 *
 * Cheap by design (a couple of env reads) so the drawer can poll it on open
 * without the heavier whole-chain /api/system/film-readiness report.
 */

import { NextResponse } from 'next/server';
import { computeVideoProviderStatus } from '@/lib/chat/videoProvider';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const status = computeVideoProviderStatus();
  return NextResponse.json({
    ...status,
    note: 'Names-only. `ready` is true when a non-empty value exists under an accepted LTX alias or REPLICATE_API_TOKEN; secret values are never read into the response. A present key can still be rejected by the provider at call time.',
  });
}
