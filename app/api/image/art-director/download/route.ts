/**
 * GET /api/image/art-director/download?path=art-director/<uid>/<id>.png&format=png|jpg — one of the caller's Art
 * Director pictures as a file (Phase 8.4). 404 unless IMAGE_ART_DIRECTOR allows this user, and for any path that is not
 * exactly one of THEIR results. Free: nothing is generated or charged.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { artDirectorAllowed } from '@/lib/image/artDirector/flag';
import { ArtError } from '@/lib/image/artDirector/errors';
import { artDownload } from '@/lib/image/artDirector/download';
import { artFileReader } from '@/lib/image/artDirector/live';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.READ, label: 'image.art-director.download', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'sign_in' }, { status: 401 });
  if (!artDirectorAllowed(await isAdminUserAsync(user))) return NextResponse.json({ ok: false, error: 'feature_off' }, { status: 404 });
  const path = req.nextUrl.searchParams.get('path') ?? '';
  const format = req.nextUrl.searchParams.get('format') === 'jpg' ? 'jpg' : 'png';
  try {
    const file = await artDownload(artFileReader(), path, user.id, format);
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'content-type': file.contentType,
        'content-disposition': `attachment; filename="${file.filename}"`,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
}
