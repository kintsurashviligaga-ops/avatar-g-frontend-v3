/**
 * POST /api/genjutsu/quote — the price of ONE press of the VFX Generate button, before anything is charged.
 * Same body as /generate (`expectedCredits` / `confirmedGel` are ignored here). Sign-in required.
 *
 *   scene          → lib/genjutsu/pricing, the function /generate charges with: `{ credits, source: 'local' }`.
 *   motion / swap  → the studio saga's LIVE quote (Higgsfield's own /estimate × GEL/USD × margin, whole credits):
 *                    `{ credits, gel, display, source: 'provider-quote' }`. The panel shows that number on the button and
 *                    sends `gel` back as `confirmedGel`; the saga charges only a price equal to a fresh quote.
 *
 * Every answer also says how many of the user's photos the engine will really receive (`refsUsed` of `refsTotal`,
 * `cap`) — the panel prints "Using 3 of 12 — this engine takes up to 3" from it BEFORE the user pays.
 */
import { NextRequest, NextResponse } from 'next/server';
import { opStatuses, motionModelId, SWAP_MODEL_ID } from '@/lib/genjutsu/capabilities';
import { ownsUploadPath, parseGenjutsuRequest } from '@/lib/genjutsu/contract';
import { ENGINES } from '@/lib/genjutsu/engines';
import { buildHfInput } from '@/lib/genjutsu/hfMotion';
import { genjutsuCredits } from '@/lib/genjutsu/pricing';
import { getPreset, composeGenjutsuPrompt } from '@/lib/genjutsu/presets';
import { selectReferences } from '@/lib/genjutsu/selection';
import { fail, issuesOf, signOwnedPaths } from '@/lib/genjutsu/serverCommon';
import { mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { billingLocale } from '@/lib/api/billingCopy';
import { REFERENCE_URL_TTL_SEC } from '@/lib/studio/media';
import { getStudioRuntime } from '@/lib/studio/runtime';
import { publicPrice, readJson, sagaError, withinEstimateBudget } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId || mustSignInToGenerate(userId)) return NextResponse.json(signInToGenerateBody(billingLocale(req)), { status: 401 });

  // A quote runs on every chip change in the panel, so it has its own wider window (and Higgsfield's /estimate is free).
  if (!(await withinEstimateBudget(userId))) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: { 'Retry-After': '60' } });

  const parsed = parseGenjutsuRequest(await readJson(req));
  if (!parsed.ok) return fail(400, 'invalid_request', { issues: issuesOf(parsed.issues) });
  const r = parsed.value;
  if (!opStatuses()[r.op].open) return fail(423, 'locked', { op: r.op });

  const engine = ENGINES[r.op];
  const pick = selectReferences(r.references.map((x) => ({ id: x.ref, role: x.role })), engine.maxRefs);
  const common = { success: true as const, op: r.op, refsUsed: pick.used.length, refsTotal: r.referencesTotal, cap: engine.maxRefs };

  if (r.op === 'scene') {
    return NextResponse.json({ ...common, credits: genjutsuCredits({ op: 'scene', refsUsed: pick.used.length, quality: r.quality }), source: 'local' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // motion / swap — the saga's live quote. The input needs public URLs, so the caller's own paths are signed (and owner-checked).
  const named = [...(r.video ? [r.video.path] : []), ...r.references.map((x) => x.ref)];
  if (named.some((p) => !ownsUploadPath(p, userId))) return fail(422, 'invalid_input', { issues: [{ path: 'references', code: 'not_owner' }] });
  const video = r.video;
  if (!video) return fail(400, 'invalid_request', { issues: [{ path: 'video', code: 'video_required' }] });
  const signedVideo = await signOwnedPaths(userId, [video.path], REFERENCE_URL_TTL_SEC);
  if (!signedVideo.ok) return fail(422, 'invalid_input', { issues: [{ path: 'video.path', code: signedVideo.code }] });
  const signedRefs = await signOwnedPaths(userId, pick.used.map((u) => u.id), REFERENCE_URL_TTL_SEC);
  if (!signedRefs.ok) return fail(422, 'invalid_input', { issues: [{ path: `references.${signedRefs.index}`, code: signedRefs.code }] });

  const modelId = r.op === 'motion' ? motionModelId(r.quality) : SWAP_MODEL_ID;
  // The price cannot depend on the words, so the preset's English text stands in for the (untranslated) typed line.
  const prompt = composeGenjutsuPrompt({ preset: getPreset(r.preset), op: r.op, roles: pick.used.map((u) => u.role) });
  const input = buildHfInput({ modelId, imageUrls: signedRefs.urls, videoUrl: signedVideo.urls[0]!, prompt, keepSound: r.keepSound });
  if (!input) return fail(503, 'model_unavailable');

  const rt = getStudioRuntime();
  if (!rt) return fail(503, 'not_configured');
  const q = await rt.saga.quote(modelId, input);
  if (!q.ok) return sagaError(q.code, { issues: q.issues });
  return NextResponse.json({ ...common, ...publicPrice(q.price), source: 'provider-quote' }, { headers: { 'Cache-Control': 'no-store' } });
}
