/**
 * /api/film/scene/redo — ONE scene of the caller's own chat film, rendered again at that scene's price (lib/chat/filmSceneRedo;
 * the owner's tap 2026-10-17 14:26:55Z, "სცენის ფასი": lib/credits/priceBook sceneCredits, 71 credits for 8 s on Fast since
 * the 100 %-profit rule of 2026-10-18; given back when Google fails the render).
 *
 *   GET  ?filmTokenId=…&ordinal=…&quote=1  what it costs (the priced question shows it) → { price, scenes }
 *   POST { filmTokenId, ordinal, note?, expectedPrice? }  charge the scene's price (never more than the price shown) and send
 *                                         the scene again from its own storyboard frame, the note folded into its prompt
 *                                         → 202 { redo, price }
 *   GET  ?filmTokenId=…&ordinal=…        follow it: rendering → ready (the new clip) | failed (price given back)
 *
 * Cutting the new clip into the film is POST /api/film/scene/redo/stitch. Signed in only; every record is the owner's.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { pollSceneRedo, quoteSceneRedo, startSceneRedo } from '@/lib/chat/filmSceneRedoFlow';
import { liveRedoDeps } from '@/lib/chat/filmSceneRedoLive';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (mustSignInToGenerate(user?.id) || !user?.id) return NextResponse.json(signInToGenerateBody(), { status: 401 });
  // Admin service switch (lib/server/serviceSwitches): a switched-off tool is refused here, before any charge.
  const serviceOff = await serviceOffResponse('video');
  if (serviceOff) return serviceOff;
  const limited = await checkRateLimitByKey(user.id, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;
  let body: { filmTokenId?: unknown; ordinal?: unknown; note?: unknown; expectedPrice?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const out = await startSceneRedo(
    user.id,
    { tokenId: body?.filmTokenId, ordinal: body?.ordinal, note: body?.note, expectedPrice: body?.expectedPrice },
    liveRedoDeps(new URL(req.url).origin),
  );
  return NextResponse.json(out.body, { status: out.status });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req);
  if (!user?.id) return NextResponse.json(signInToGenerateBody(), { status: 401 });
  const limited = await checkRateLimitByKey(user.id, RATE_LIMITS.TASKS);
  if (limited) return limited;
  const q = new URL(req.url).searchParams;
  const target = { tokenId: q.get('filmTokenId'), ordinal: q.get('ordinal') };
  const deps = liveRedoDeps(new URL(req.url).origin);
  const out = q.get('quote') === '1' ? await quoteSceneRedo(user.id, target, deps) : await pollSceneRedo(user.id, target, deps);
  return NextResponse.json(out.body, { status: out.status, headers: { 'Cache-Control': 'no-store' } });
}
