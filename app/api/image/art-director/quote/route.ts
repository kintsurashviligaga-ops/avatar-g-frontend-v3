/**
 * POST /api/image/art-director/quote — the price of a press before it is pressed (free, no provider call, no charge).
 * Same gate as the run route: 404 unless IMAGE_ART_DIRECTOR allows this user.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { artDirectorAllowed } from '@/lib/image/artDirector/flag';
import { ArtRequestSchema, artWarnings } from '@/lib/image/artDirector/request';
import { artBook, quoteArt, sizesFor } from '@/lib/image/artDirector/price';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'sign_in' }, { status: 401 });
  if (!artDirectorAllowed(await isAdminUserAsync(user))) return NextResponse.json({ ok: false, error: 'feature_off' }, { status: 404 });
  const parsed = ArtRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_request', issues: parsed.error.issues.map((i) => i.path.join('.')) }, { status: 400 });
  const book = artBook();
  const q = quoteArt({ size: parsed.data.size, references: parsed.data.references.length, book, count: parsed.data.count });
  return NextResponse.json({ ok: true, book, sizes: sizesFor(book), quote: q, warnings: artWarnings(parsed.data) });
}
