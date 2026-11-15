/**
 * GET /api/image/art-director/recipe?path=art-director/<uid>/<id>.png — the stored recipe of one of the caller's Art
 * Director pictures (prompt, model, style, ratio, size, seed, references by letter, price, mask proof) for the Library
 * card and "remix this". Read from the JSON next to the picture; no DB column is needed while migrations are frozen.
 * 404 unless IMAGE_ART_DIRECTOR allows this user, and for any path that is not exactly one of THEIR results.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { artDirectorAllowed } from '@/lib/image/artDirector/flag';
import { ArtError } from '@/lib/image/artDirector/errors';
import { readArtRecipe } from '@/lib/image/artDirector/download';
import { artFileReader } from '@/lib/image/artDirector/live';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.READ, label: 'image.art-director.recipe', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req);
  if (!user) return NextResponse.json({ ok: false, error: 'sign_in' }, { status: 401 });
  if (!artDirectorAllowed(await isAdminUserAsync(user))) return NextResponse.json({ ok: false, error: 'feature_off' }, { status: 404 });
  try {
    const recipe = await readArtRecipe(artFileReader(), req.nextUrl.searchParams.get('path') ?? '', user.id);
    if (!recipe) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
    // The references' own storage paths stay on the server; the card shows letters and roles.
    return NextResponse.json({ ok: true, recipe: { ...recipe, references: recipe.references.map(({ letter, role, locked }) => ({ letter, role, locked })) } });
  } catch (e) {
    if (e instanceof ArtError) return NextResponse.json({ ok: false, error: e.code }, { status: e.status });
    return NextResponse.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
}
