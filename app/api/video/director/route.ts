/**
 * GET /api/video/director — whether the studio should hand an approved storyboard to the director run for THIS user
 * (VIDEO_DIRECTOR_RUNS, lib/video/director/runServer). A boolean only; the studio asks instead of assuming, so with the
 * flag off (or `admin` and a non-admin) nothing in the studio changes. Never 404: the answer is just `false`.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { directorRunsAccess, directorRunsConfigured, directorRunsOpenTo } from '@/lib/video/director/runServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  let enabled = false;
  if (directorRunsAccess() !== 'off' && directorRunsConfigured()) {
    const { user } = await authedClientFromRequest(req);
    enabled = Boolean(user && directorRunsOpenTo(user));
  }
  return NextResponse.json({ enabled }, { headers: { 'Cache-Control': 'private, no-store' } });
}
