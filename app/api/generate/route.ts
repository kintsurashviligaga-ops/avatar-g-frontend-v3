/**
 * POST /api/generate — the ONE entry point for studio generations (brief §4), used by the studio UI and,
 * later, by Agent G's tools. Nothing here — and nothing Agent G does — spends money without a price the
 * user confirmed.
 *
 * Body: { modelId, params, confirmedGel, promptOriginal? }
 *   409 confirmation_required / price_changed → { price } — show it, ask again, resend with confirmedGel
 *   402 insufficient_credits → { price }
 *   202 → { job } — then poll GET /api/generate/:id
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkProduceRate, rateLimitedResponse } from '@/lib/orchestrator/rate-limit';
import { studioV2Enabled } from '@/lib/studio/flags';
import { getStudioRuntime, signUploadedReference } from '@/lib/studio/runtime';
import { publicJob } from '@/lib/studio/saga';
import { mediaParams, notFound, publicPrice, readJson, sagaError, unauthorized } from '@/lib/studio/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// One submit POST (≤ 30 s) plus estimate and ledger round-trips.
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  if (!studioV2Enabled()) return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return unauthorized();

  const body = await readJson(req);
  const modelId = typeof body?.modelId === 'string' ? body.modelId : '';
  if (!body || !modelId) return sagaError('invalid_input', { issues: [{ path: 'modelId', message: 'required' }] });
  const confirmedGel = typeof body.confirmedGel === 'number' ? body.confirmedGel : null;
  const promptOriginal = typeof body.promptOriginal === 'string' ? body.promptOriginal : null;

  const rate = await checkProduceRate(user.id, Date.now(), 'studio');
  if (!rate.ok) return rateLimitedResponse(rate);

  const rt = getStudioRuntime();
  if (!rt) return sagaError('not_configured');

  const media = await mediaParams(body.params, user.id, signUploadedReference);
  if (!media.ok) return media.res;
  const res = await rt.saga.create({ userId: user.id, modelId, params: media.params, confirmedGel, promptOriginal });
  if (!res.ok) return sagaError(res.code, { price: res.price, issues: res.issues });
  return NextResponse.json({ job: publicJob(res.job), price: publicPrice(res.price) }, { status: 202 });
}
