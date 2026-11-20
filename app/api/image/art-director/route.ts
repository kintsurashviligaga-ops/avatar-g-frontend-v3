/**
 * POST /api/image/art-director — one Art Director press (Phase 8.4): a grid of 1/2/4, an edit, a region edit, an extend,
 * an upscale (re-render) or a variation, on gemini-3.1-flash-image via Vertex only.
 *
 * Refuses (404) unless IMAGE_ART_DIRECTOR allows this user (off by default). Signed-in only. The price is the image
 * price of the live book (lib/image/artDirector/price) per image; the total is checked first, each delivered image is
 * charged under its own ref, a failed one is never charged. Nothing here touches BOG or the ledger code.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { platformBudgetRefusal } from '@/lib/services/billing/budgetCheck';
import { BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { artDirectorAllowed } from '@/lib/image/artDirector/flag';
import { ArtRequestSchema } from '@/lib/image/artDirector/request';
import { artBook, imageCredits } from '@/lib/image/artDirector/price';
import { ArtError } from '@/lib/image/artDirector/errors';
import { runArt } from '@/lib/image/artDirector/run';
import { liveArtDeps } from '@/lib/image/artDirector/live';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const fail = (code: string, message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ ok: false, error: code, message, ...extra }, { status });

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'image.art-director', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req);
  if (!user) return fail('sign_in', 'Sign in to create images.', 401);
  if (!artDirectorAllowed(await isAdminUserAsync(user))) return fail('feature_off', 'Not found.', 404);
  const off = await serviceOffResponse('image');
  if (off) return off;

  const parsed = ArtRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail('invalid_request', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 400);
  const request = parsed.data;
  const perImage = imageCredits({ size: request.size, references: request.references.length, book: artBook() });
  if (perImage == null) return fail('size_not_sold', `${request.size} is not on sale yet.`, 400);

  const refusal = await platformBudgetRefusal({ service: 'image', model: 'gemini-image', units: request.count });
  if (refusal) return fail('budget_refused', refusal, 503);

  try {
    const result = await runArt(liveArtDeps(), user.id, request, perImage, req.signal);
    return NextResponse.json({ ok: true, perImage, ...result });
  } catch (e) {
    if (e instanceof ArtError) return fail(e.code, e.message, e.status);
    if (e instanceof BudgetExceededError) return fail('budget_refused', 'The image budget is used up for now.', 503);
    return fail('provider_unavailable', 'The image could not be made. Nothing was charged for images that did not arrive.', 502);
  }
}
