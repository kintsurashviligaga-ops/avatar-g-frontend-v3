/**
 * GET /api/studio/catalogue[?service=video] — which models of the catalogue (lib/providers/catalogue) THIS deployment can
 * run right now, for every model picker:
 *
 *   { models: [{ id, available, reason }] }     reason ∈ unverified · not_enabled · studio_off · not_configured · busy · null
 *
 * The names, the "best for" lines and the capabilities are NOT here — the picker imports the catalogue itself and renders
 * before this answers; this only says which rows a tap may choose. Ids, booleans and a reason word: never a key, an env
 * value, an endpoint or a price (the price is the server's quote for the id the request carries).
 *
 * Public, like /api/video/engine and /api/ai/music/engines — the Image and Video panels are shown to guests too — and NOT
 * behind STUDIO_V2: with the flag off the Higgsfield rows still exist, answered `studio_off`. IP rate-limited because a
 * music row reads the engines' breakers. Fail-closed for the rows a flag gates: anything that throws answers 503 and the
 * picker keeps only the rows its own route always runs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { isCatalogueService } from '@/lib/providers/catalogue';
import { catalogueStatus } from '@/lib/providers/catalogueStatus';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const rl = await checkRateLimit(req, RATE_LIMITS.READ);
  if (rl) return rl;
  const s = req.nextUrl.searchParams.get('service');
  const service = isCatalogueService(s) ? s : undefined;
  try {
    const models = await catalogueStatus(service);
    return NextResponse.json({ models }, { headers: { 'Cache-Control': 'private, max-age=30' } });
  } catch {
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
