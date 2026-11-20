/**
 * GET /api/music/producer/recipe?id=<trackId> — a Music Producer track's recipe (spec, lyrics, synced lines, length) and a
 * fresh signed link, for the Library card and for reopening the Music Card. The caller's own tracks only. Free.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { createSignedAssetUrl } from '@/lib/orchestrator/storage-adapter';
import { producerAllowed } from '@/lib/music/producer/flag';
import { liveProducerDeps, RESULTS_BUCKET } from '@/lib/music/producer/live';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return NextResponse.json({ ok: false, error: 'sign_in' }, { status: 401 });
  if (!producerAllowed(await isAdminUserAsync(user))) return NextResponse.json({ ok: false, error: 'feature_off' }, { status: 404 });
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  const meta = await liveProducerDeps().loadRecipe(user.id, id);
  if (!meta) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const url = await createSignedAssetUrl(RESULTS_BUCKET, meta.audioPath, 7 * 24 * 3600);
  return NextResponse.json({ ok: true, id, url, meta }, { headers: { 'Cache-Control': 'private, no-store' } });
}
