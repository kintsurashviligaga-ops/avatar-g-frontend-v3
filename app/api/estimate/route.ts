/**
 * POST /api/estimate — the price of a generation BEFORE anything is charged (brief D5).
 * Body: { modelId: string, params: object } → { modelId, price: { credits, gel, display } }
 *
 * Signed-in only: every estimate is a call on our provider account. Behind STUDIO_V2.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { studioV2Enabled } from '@/lib/studio/flags';
import { getStudioRuntime } from '@/lib/studio/runtime';
import { notFound, publicPrice, readJson, sagaError, unauthorized, withinEstimateBudget } from '@/lib/studio/http';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (!studioV2Enabled()) return notFound();
  const { user } = await authedClientFromRequest(req);
  if (!user) return unauthorized();
  if (!(await withinEstimateBudget(user.id))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });
  }

  const body = await readJson(req);
  const modelId = typeof body?.modelId === 'string' ? body.modelId : '';
  if (!body || !modelId) return sagaError('invalid_input', { issues: [{ path: 'modelId', message: 'required' }] });

  const rt = getStudioRuntime();
  if (!rt) return sagaError('not_configured');
  const q = await rt.saga.quote(modelId, body.params ?? {});
  if (!q.ok) return sagaError(q.code, { issues: q.issues });
  return NextResponse.json({ modelId: q.model.id, price: publicPrice(q.price) });
}
