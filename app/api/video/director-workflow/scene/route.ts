/**
 * POST /api/video/director-workflow/scene — start (and charge) ONE scene of an approved storyboard.
 *
 * A scene is exactly one direct clip, so this is the single-clip route's charge path (app/api/video/clip) with the scene
 * card in place of a chat prompt: same engines, same price book, same job row with `_reserve`, same debit ref, same signed
 * charge token. The browser polls GET /api/genjutsu/status?id=<jobId>, which refunds a failed render automatically.
 *
 * Body: { project, sceneId, expectedCredits, previousClipUrl?, photo? }
 *   • project — the board as approved; it is checked again here (a board with problems is refused, free).
 *   • expectedCredits — the price the card showed for this scene; another server price is refused free (409).
 *   • previousClipUrl — the previous scene's delivered clip, when this scene continues from it: its last frame becomes
 *     this scene's first frame (lib/video/lastFrame). A clip whose frame cannot be read is refused BEFORE any charge.
 *   • photo — a data URL, when the card's first frame is a photo.
 *
 * ORDER (the safety, as in /api/video/clip): flag (404) → service switch → rate → parse + rules (free) → price check →
 * one start per scene at a time → ledger ready → balance → tier open → first frame → English for the engine → daily
 * slot → job row with `_reserve` → DEBIT → submit once → refund on any miss.
 */
import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { llmText } from '@/lib/ai/llmText';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { composeOmniJobId, composeVeoJobId, genjutsuChargeReady, genjutsuChargeRef, genjutsuJobId, signGenjutsuCharge, withGenjutsuCharge } from '@/lib/genjutsu/chargeToken';
import { GENJUTSU_RATE, claimDailySlot, fail, releaseDailySlot } from '@/lib/genjutsu/serverCommon';
import { submitScene } from '@/lib/genjutsu/veoScene';
import { reportError } from '@/lib/observability/report-error';
import { claimIdempotencyKey, releaseIdempotencyKey } from '@/lib/orchestrator/idempotency';
import { createJob, failJob } from '@/lib/orchestrator/jobs';
import { deductCredits, hasSufficientBalance, refundDebitByRef } from '@/lib/orchestrator/ledger';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';
import { readJson } from '@/lib/studio/http';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { veoModelProblem } from '@/lib/veo/engine';
import { DIRECT_CLIP_BODY_MAX_BYTES, parseClipPhoto, type DirectClipPhoto } from '@/lib/video/directClip';
import { DW_VEO_TIER, composeScenePrompt, livePricer, sceneClipSpec } from '@/lib/video/directorsWorkflow';
import { checkProject, directorsWorkflowOpenTo, translateScene } from '@/lib/video/directorsWorkflow/server';
import { extractLastFrame } from '@/lib/video/lastFrame';
import { OMNI_MODEL, submitOmniClip } from '@/lib/video/omniClip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const ROUTE = '/api/video/director-workflow/scene';
const URL_MAX = 2_000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { user } = await authedClientFromRequest(req).catch(() => ({ user: null }));
  if (!directorsWorkflowOpenTo(user)) return fail(404, 'not_found');
  const userId = user!.id;
  const serviceOff = await serviceOffResponse('video');
  if (serviceOff) return serviceOff;
  const limited = await checkRateLimitByKey(userId, GENJUTSU_RATE);
  if (limited) return limited;

  const body = (await readJson(req, DIRECT_CLIP_BODY_MAX_BYTES)) as Record<string, unknown> | null;
  const checked = checkProject(body?.project);
  if (!checked) return fail(400, 'invalid_project');
  if (checked.problems.length > 0) return fail(422, 'board_has_problems', { problems: checked.problems });
  const { project } = checked;
  const scene = project.scenes.find((s) => s.id === body?.sceneId);
  if (!scene) return fail(404, 'scene_not_found');

  const spec = sceneClipSpec(project, scene);
  const credits = livePricer(spec);
  if (body?.expectedCredits !== credits) return fail(409, 'price_changed', { credits });

  // A double tap on "re-render scene 3" is one render, not two.
  const key = `dw-scene:${project.id}:${scene.id}`;
  if (!(await claimIdempotencyKey(userId, key, 120))) return fail(409, 'duplicate_request');
  try {
    return await startScene({ userId, body, project, scene, spec, credits });
  } finally {
    await releaseIdempotencyKey(userId, key).catch(() => undefined);
  }
}

type Ctx = {
  userId: string;
  body: Record<string, unknown> | null;
  project: NonNullable<ReturnType<typeof checkProject>>['project'];
  scene: NonNullable<ReturnType<typeof checkProject>>['project']['scenes'][number];
  spec: ReturnType<typeof sceneClipSpec>;
  credits: number;
};

async function startScene({ userId, body, project, scene, spec, credits }: Ctx): Promise<NextResponse> {
  if (!genjutsuChargeReady()) return fail(503, 'billing_unavailable');
  if (!(await hasSufficientBalance(userId, credits))) return fail(402, 'insufficient_credits', { needed: credits });
  if (spec.engine === 'veo' && veoModelProblem(DW_VEO_TIER) !== null) return fail(503, 'tier_unavailable', { refunded: false });

  // The first frame, read BEFORE anything is taken.
  let firstFrame: DirectClipPhoto | null = null;
  if (scene.firstFrame === 'previous') {
    const url = typeof body?.previousClipUrl === 'string' ? body.previousClipUrl : '';
    if (!/^https:\/\//i.test(url) || url.length > URL_MAX) return fail(422, 'previous_clip_required');
    const jpeg = await extractLastFrame(url);
    if (!jpeg) return fail(422, 'previous_frame_unavailable');
    firstFrame = { base64: jpeg.toString('base64'), mimeType: 'image/jpeg' };
  } else if (scene.firstFrame === 'photo') {
    const photo = parseClipPhoto(body?.photo);
    if (!photo || photo === 'too_large') return fail(422, 'photo_required', { code: photo === 'too_large' ? 'too_large' : 'invalid' });
    firstFrame = photo;
  }

  const english = await translateScene(project, scene, (prompt) => llmText({ user: prompt, json: true, maxTokens: 1_200, temperature: 0.2, timeoutMs: 15_000 }));
  const prompt = composeScenePrompt(project, scene, english);

  const uuid = randomUUID();
  if (!(await claimDailySlot())) return fail(429, 'rate_limited', { scope: 'daily' });
  const ref = genjutsuChargeRef(userId, uuid);
  const rowId = genjutsuJobId(uuid);
  const createdMs = Date.now();

  const filed = await createJob({
    id: rowId, userId, serviceType: 'film', status: 'processing',
    params: {
      subtype: 'video', op: 'dw-scene', engine: spec.engine, project: project.id, version: project.version, sceneId: scene.id,
      order: scene.order, aspect: project.aspect, seconds: spec.seconds, resolution: spec.resolution,
      ...(spec.speech ? { speech: spec.speech } : {}), _reserve: { ref, credits },
    },
  });
  if (!filed) reportError(new Error('director scene job row not filed'), { route: ROUTE, ref });

  const debit = await deductCredits(userId, credits, ref);
  if (!debit.ok) {
    await failJob(rowId, debit.reason === 'insufficient' ? 'insufficient credits' : 'ledger unavailable');
    await releaseDailySlot();
    return debit.reason === 'insufficient' ? fail(402, 'insufficient_credits', { needed: credits }) : fail(503, 'billing_unavailable');
  }
  const refund = async (why: string): Promise<boolean> => {
    const back = await refundDebitByRef(userId, ref, credits).catch(() => null);
    if (!back?.ok) reportError(new Error('director scene refund did not land'), { route: ROUTE, ref, why });
    await failJob(rowId, why);
    return !!back?.ok;
  };

  const sub = spec.engine === 'omni'
    ? await submitOmniClip({ prompt, aspect: project.aspect, resolution: spec.resolution, seconds: spec.seconds, userId, ...(firstFrame ? { firstFrame } : {}) })
      .then((o) => (o.ok ? { ok: true as const, operation: o.id, aspect: project.aspect, omni12: o.model === OMNI_MODEL } : o))
    : await submitScene({
      prompt, aspect: project.aspect, quality: 'fast', tier: DW_VEO_TIER, durationSec: spec.seconds, userId, sessionId: `dw-${uuid}`,
      referenceUrls: [],
      ...(firstFrame ? { startImage: { kind: 'bytes' as const, base64: firstFrame.base64, mimeType: firstFrame.mimeType }, resizeMode: 'crop' as const } : {}),
    });
  if (!sub.ok) {
    const refunded = await refund(`${spec.engine} ${sub.reason}`);
    await releaseDailySlot();
    const code = sub.reason === 'invalid_request' ? 'invalid_input' : sub.reason === 'safety' ? 'content_rejected' : sub.reason === 'not_configured' ? 'not_configured' : 'provider_unavailable';
    return fail(sub.reason === 'invalid_request' || sub.reason === 'safety' ? 422 : 503, code, { refunded });
  }

  const jobId = spec.engine === 'omni'
    ? composeOmniJobId(sub.operation, project.aspect, createdMs, undefined, spec.seconds, 'omni12' in sub && sub.omni12)
    : composeVeoJobId(sub.operation, sub.aspect, createdMs, false, spec.seconds as 4 | 6 | 8);
  const token = signGenjutsuCharge({ u: userId, r: ref, j: jobId });
  if (!token) {
    const refunded = await refund('no charge token');
    return fail(503, 'billing_unavailable', { refunded });
  }
  return NextResponse.json({
    success: true, op: 'dw-scene', sceneId: scene.id, jobId: withGenjutsuCharge(jobId, token), taskId: rowId, credits,
    seconds: spec.seconds, resolution: spec.resolution, engine: spec.engine === 'omni' ? 'Gemini Omni Flash' : 'Veo',
  }, { status: 202 });
}
