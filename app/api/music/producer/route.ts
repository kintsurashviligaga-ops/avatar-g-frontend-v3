/**
 * POST /api/music/producer — one Music Producer press (Phase 8.5): generate, "Restyle (new take)" or
 * "Add 30 s (new section, same style)", on Lyria 3 via Vertex only (Clip for 30 s, Pro for 1–3 min).
 *
 * Refuses (404) unless MUSIC_PRODUCER_V2 allows this user (off by default). Signed-in only. The price comes from
 * lib/music/producer/price (live book today, the 65 % book under NEXT_PUBLIC_PRICING_V8); the balance is checked first,
 * the track is charged once only after it arrived, and a save miss is refunded. Nothing here touches BOG or the ledger code.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { isAdminUserAsync } from '@/lib/admin/guard';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { platformBudgetRefusal } from '@/lib/services/billing/budgetCheck';
import { producerAllowed } from '@/lib/music/producer/flag';
import { parseProducerRequest } from '@/lib/music/producer/request';
import { producerBook } from '@/lib/music/producer/book';
import { quoteProducer } from '@/lib/music/producer/price';
import { ProducerError } from '@/lib/music/producer/errors';
import { runProducer } from '@/lib/music/producer/run';
import { liveProducerDeps } from '@/lib/music/producer/live';
import { LYRIA_CLIP, LYRIA_PRO } from '@/lib/music/producer/brief';
import type { ProducerLength } from '@/lib/music/producer/spec';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const fail = (code: string, message: string, status: number) => NextResponse.json({ ok: false, error: code, message }, { status });

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'music.producer', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req);
  if (!user) return fail('sign_in', 'Sign in to make music.', 401);
  if (!producerAllowed(await isAdminUserAsync(user))) return fail('feature_off', 'Not found.', 404);
  const off = await serviceOffResponse('music');
  if (off) return off;

  const parsed = parseProducerRequest(await req.json().catch(() => null));
  if (!parsed.ok) return fail('invalid_request', parsed.errors.join('; '), 400);
  const request = parsed.request;
  const book = producerBook();
  // Restyle keeps the parent's length; the route charges what the parent's length costs (read in runProducer's spec).
  const deps = liveProducerDeps();
  let lengthSec: ProducerLength = request.action === 'generate' ? request.spec.lengthSec : 30;
  if (request.action === 'restyle') {
    const parent = await deps.loadRecipe(user.id, request.parentId);
    if (!parent) return fail('not_found', 'That track was not found.', 404);
    lengthSec = parent.spec.lengthSec;
  }
  const quote = quoteProducer(request.action, lengthSec, book);
  const model = quote.model === 'clip' ? LYRIA_CLIP : LYRIA_PRO;
  const refusal = await platformBudgetRefusal({ service: 'music', model, units: 1 });
  if (refusal) return fail('budget_refused', refusal, 503);

  try {
    const result = await runProducer(deps, user.id, request, quote.credits, book, req.signal);
    return NextResponse.json({ ok: true, book, ...result });
  } catch (e) {
    if (e instanceof ProducerError) return fail(e.code, e.message, e.status);
    return fail('provider_unavailable', 'The track could not be made. Nothing was charged.', 502);
  }
}
