import { NextRequest, NextResponse } from 'next/server';

import { isAdmin } from '@/lib/auth/adminGuard';

export const dynamic = 'force-dynamic';

/**
 * POST /api/video/generate-promo — the admin promo (marketing) image-to-video render, retired.
 *
 * It rendered on Replicate MiniMax and ran only with VIDEO_GOOGLE_ONLY switched off. Video renders on Veo only, and
 * since MASTER TASK v3.1 no env value re-opens another engine, so it keeps its admin gate and refuses before the body is
 * read, with no provider code behind it.
 */
export async function POST(_req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  return NextResponse.json({ error: 'google_only', message: 'Video renders on Veo only.' }, { status: 503 });
}
