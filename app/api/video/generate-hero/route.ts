import { NextRequest, NextResponse } from 'next/server';

import { isAdmin } from '@/lib/auth/adminGuard';

/**
 * POST /api/video/generate-hero — the admin hero (marketing) render, retired.
 *
 * It rendered on Replicate MiniMax and ran only with VIDEO_GOOGLE_ONLY switched off. Video renders on Veo only, and
 * since MASTER TASK v3.1 no env value re-opens another engine, so it keeps its admin gate and refuses with no provider
 * code behind it. A hero film is made in the Studio, where Veo plans and bills it.
 */
export async function POST(_req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  return NextResponse.json({ error: 'google_only', message: 'Video renders on Veo only.' }, { status: 503 });
}
