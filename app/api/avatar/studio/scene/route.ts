/**
 * /api/avatar/studio/scene — ONE scene of a Virtual Studio presentation.
 *
 * POST { projectId, request, sceneIndex, expectedCredits, text?, take } → start (and charge) it.
 *   ORDER (the safety): flag (404) → service switch → rate → parse + plan rebuilt here (free) → the scene's price
 *   matched against the card (409 free if it moved) → platform budget (Live) → balance → ONE debit by ref → render.
 *   Live answers `ready` in this call; Omni answers `processing` and the browser polls GET.
 * GET ?job=<id> → one poll (Omni: next turn / delivery / refund on failure). Never charges.
 */
import { NextRequest, NextResponse } from 'next/server';
import { applyApiGuards } from '@/lib/api/guard';
import { RATE_LIMITS } from '@/lib/api/rate-limit';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { platformBudgetRefusal } from '@/lib/services/billing/budgetCheck';
import { buildStudioPlan } from '@/lib/avatar/studio/plan';
import { parseSceneStart } from '@/lib/avatar/studio/request';
import { studioBook } from '@/lib/avatar/studio/book';
import { StudioError } from '@/lib/avatar/studio/errors';
import { pollScene, publicJob, sceneToMake, startScene } from '@/lib/avatar/studio/sceneRun';
import { liveSceneDeps, signedStudioUrl } from '@/lib/avatar/studio/live';
import { studioFail, studioOpenTo } from '@/lib/avatar/studio/server';
import { LIVE_AVATAR_MODEL } from '@/lib/voice/liveAvatar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** A Live take records in real time (≤ 40 s of speech, plus one free retake and the 16:9 compose). */
export const maxDuration = 300;

/** ≈ video tokens a Live presenter second costs (lib/voice/liveAvatar: 6.2k/s), for the budget guard. */
const LIVE_TOKENS_PER_SEC = 6_192;

export async function POST(req: NextRequest) {
  const gate = await applyApiGuards(req, { limit: RATE_LIMITS.EXPENSIVE, label: 'avatar.studio.scene', requireAuth: true });
  if (gate.response) return gate.response;
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return studioFail('sign_in', 'Sign in to use the studio.', 401);
  if (!(await studioOpenTo(user))) return studioFail('feature_off', 'Not found.', 404);
  const off = await serviceOffResponse('avatar');
  if (off) return off;

  const parsed = parseSceneStart(await req.json().catch(() => null));
  if (!parsed.ok) return studioFail('invalid_request', parsed.errors.join('; '), 400);
  const start = parsed.value;
  const book = studioBook();
  const built = buildStudioPlan(start.request, { book });
  if (!built.ok) return studioFail(built.reason, built.detail, built.reason === 'custom_avatar' ? 422 : 400);
  const plan = built.plan;
  const scene = sceneToMake(plan, start.sceneIndex, book, start.text);
  if (!scene.ok) return studioFail('invalid_request', scene.reason, 400);
  if (scene.credits !== start.expectedCredits) return studioFail('price_changed', 'The price changed. Nothing was charged.', 409, { credits: scene.credits });

  if (plan.presenter.engine === 'live') {
    const refusal = await platformBudgetRefusal({ service: 'avatar', model: LIVE_AVATAR_MODEL, outputTokens: Math.ceil(scene.estSec * LIVE_TOKENS_PER_SEC * 2) });
    if (refusal) return studioFail('budget_refused', refusal, 503);
  }
  const bg = start.request.background;
  const backgroundUrl = bg?.kind === 'upload' ? await signedStudioUrl(user.id, bg.path) : null;
  if (bg?.kind === 'upload' && !backgroundUrl) return studioFail('not_found', 'The background image was not found.', 404);

  try {
    const job = await startScene(liveSceneDeps(user.id), user.id, {
      projectId: start.projectId, sceneIndex: start.sceneIndex, take: start.take, plan, scene, credits: scene.credits, backgroundUrl,
    }, req.signal);
    return NextResponse.json({ ok: true, book, job: publicJob(job) });
  } catch (e) {
    if (e instanceof StudioError) return studioFail(e.code, e.message, e.status);
    return studioFail('provider_unavailable', 'The scene could not be made. Nothing was charged.', 502);
  }
}

export async function GET(req: NextRequest) {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!user) return studioFail('sign_in', 'Sign in to use the studio.', 401);
  if (!(await studioOpenTo(user))) return studioFail('feature_off', 'Not found.', 404);
  const id = req.nextUrl.searchParams.get('job') ?? '';
  const deps = liveSceneDeps(user.id);
  const job = await deps.loadJob(user.id, id);
  if (!job) return studioFail('not_found', 'That scene was not found.', 404);
  try {
    return NextResponse.json({ ok: true, job: publicJob(await pollScene(deps, user.id, job)) });
  } catch (e) {
    if (e instanceof StudioError) return studioFail(e.code, e.message, e.status);
    return NextResponse.json({ ok: true, job: publicJob(job) }); // a transient miss reads as "still working"
  }
}
