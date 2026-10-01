/**
 * POST /api/video/longform — order a long-form (8 s … 240 s) film: validate → Director → rows. Nothing renders here
 * and nothing is charged here: the cron tick (app/api/cron/longform-tick) reserves credits ONE ACT AT A TIME, just
 * ahead of rendering it, and refunds every scene it cannot deliver (docs/video/LONGFORM.md §5).
 *
 *   404  LONGFORM_VIDEO_ENABLED off — answered BEFORE auth: a dark feature neither runs nor confirms it exists
 *   401  no verified session
 *   503  LONGFORM_MARGIN unset (limits.ts — the price is the owner's), or balance / storage unreadable
 *   429  the per-account create rate, or too many films already in flight
 *   400  the body's shape, or the plan's grid / tier / budget rules — EVERY reason, so the UI explains them at once
 *   402  only the balance stands in the way
 *   502 / 504  the Director failed / missed its 240 s deadline — nothing written, nothing charged
 *   201  { id, status: 'planned', … } — the film is queued
 *
 * ⚠️ ROWS ONLY AFTER THE DIRECTOR SUCCEEDS, AND IN THREE WRITES: the job `directing` (not claimable), its scenes, then
 * the promotion to `planned`. A tick that leased a job whose scenes were still being inserted would settle it as
 * `no_scenes`. If a later write fails, the job row is deleted (its scenes cascade); if even that fails, the stray
 * `directing` row holds no charge and is failed by the tick once its 10-minute directing deadline passes.
 *
 * ⚠️ maxDuration 300 here AND in vercel.json (which overrides it; the app/api/video/** glob alone grants 60 s).
 */
import { randomInt, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimitByKey } from '@/lib/api/rate-limit';
import { isAnonymousUser, mustSignInToGenerate, signInToGenerateBody } from '@/lib/auth/generationGate';
import { reportError } from '@/lib/observability/report-error';
import { getDailyUsage } from '@/lib/services/billing/BillingGuard';
import { limitsFromEnv } from '@/lib/services/billing/budgetPolicy';
import { authedClientFromRequest, createServiceRoleClient } from '@/lib/supabase/server';
import { DIRECTOR_DEADLINE_MS, parseLongformCreateBody, runDirectorWithDeadline } from '@/lib/video/longform/api';
import { llmDirectorGenerate } from '@/lib/video/longform/directorLlm';
import {
  LONGFORM_CREATE_RATE_LIMIT,
  longformLimitsFor,
  longformMaxActiveJobs,
  longformPricingFromEnv,
  readLongformAccount,
} from '@/lib/video/longform/limits';
import { isLongformEnabled, validateLongformRequest, type LongformPlan } from '@/lib/video/longform/plan';
import { directedColumns, jobInsertRow, sceneInsertRows } from '@/lib/video/longform/rows';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

const SEED_RANGE = 4_294_967_296;

const json = (body: unknown, status: number) => NextResponse.json(body, { status });

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isLongformEnabled()) return json({ error: 'Not found' }, 404);

  let userId: string | null = null;
  try {
    userId = (await authedClientFromRequest(req)).user?.id ?? null;
  } catch {
    userId = null; // no Supabase env / an auth outage reads as "no session" — never as a user
  }
  // ⚠️ FILM_ALLOW_ANONYMOUS does NOT reopen long-form: the rows reference auth.users and every act is debited from a
  // real balance, so there is no anonymous version of this to demo.
  if (!userId || isAnonymousUser(userId) || mustSignInToGenerate(userId)) return json(signInToGenerateBody(), 401);

  const priced = longformPricingFromEnv();
  if (!priced.ok) return json(priced.body, priced.status);

  const limited = await checkRateLimitByKey(userId, LONGFORM_CREATE_RATE_LIMIT);
  if (limited) return limited;

  const parsed = parseLongformCreateBody(await req.json().catch(() => null));
  if (!parsed.ok) return json({ error: 'invalid_request', reasons: parsed.reasons }, 400);
  const body = parsed.value;

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch (e) {
    reportError(e, { route: '/api/video/longform', stage: 'service_role' });
    return json({ error: 'unavailable' }, 503);
  }

  const [account, usage] = await Promise.all([
    readLongformAccount(svc, userId),
    getDailyUsage().catch(() => null),
  ]);
  // ⚠️ Fail CLOSED on an unreadable balance or count: the Director's LLM calls are spent before any credit is
  // taken, so "could not check" must not become "proceed".
  if (account.balanceCredits === null || account.activeJobs === null) return json({ error: 'billing_unavailable' }, 503);
  const maxActive = longformMaxActiveJobs();
  if (account.activeJobs >= maxActive) {
    return json({ error: 'too_many_active_jobs', message: `At most ${maxActive} long-form films can be in progress at once.` }, 429);
  }

  const limits = longformLimitsFor(account, {
    dailyLimitUsd: limitsFromEnv().dailyLimit,
    remainingUsd: usage ? usage.limit - usage.used : null,
  });
  const validation = validateLongformRequest(
    { seconds: body.seconds, tier: body.tier, resolution: body.resolution, generateAudio: body.generateAudio },
    limits,
    priced.pricing,
  );
  if (!validation.ok || !validation.plan?.credits) {
    const onlyBalance = validation.reasons.length > 0 && validation.reasons.every((r) => r.code === 'insufficient_credits');
    return json(
      { error: onlyBalance ? 'insufficient_credits' : 'invalid_request', reasons: validation.reasons, warnings: validation.warnings },
      onlyBalance ? 402 : 400,
    );
  }
  const plan = validation.plan as LongformPlan & { credits: NonNullable<LongformPlan['credits']> };

  const directed = await runDirectorWithDeadline(
    {
      brief: body.prompt,
      seconds: plan.seconds,
      ...(body.language ? { language: body.language } : {}),
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.dialogue ? { dialogue: body.dialogue } : {}),
      hasReferenceImage: body.referenceImageUrls.length > 0,
    },
    llmDirectorGenerate,
    { deadlineMs: DIRECTOR_DEADLINE_MS },
  );
  if (!directed.ok) {
    const timeout = directed.error === 'director_timeout';
    return json(
      {
        error: timeout ? 'director_timeout' : 'director_failed',
        reason: directed.error,
        ...('act' in directed && typeof directed.act === 'number' ? { act: directed.act } : {}),
        message: 'The storyboard could not be written. Nothing was charged — please try again.',
      },
      timeout ? 504 : 502,
    );
  }
  const { storyboard } = directed;

  const id = randomUUID();
  const now = Date.now();
  const jobRow = jobInsertRow({
    id,
    userId,
    prompt: body.prompt,
    plan,
    bible: storyboard.bible,
    format: body.format,
    options: {
      ...(body.negativePrompt ? { negativePrompt: body.negativePrompt } : {}),
      ...(body.referenceImageUrls.length ? { referenceImageUrls: body.referenceImageUrls } : {}),
    },
    seed: body.seed ?? randomInt(0, SEED_RANGE),
    now,
  });
  const sceneRows = sceneInsertRows({ jobId: id, userId, scenes: storyboard.scenes, chainActFrames: body.referenceImageUrls.length === 0 });

  const notQueued = () => json({ error: 'unavailable', message: 'The film could not be queued. Nothing was charged — please try again.' }, 503);
  /** A later write failed: take the job back out (its scenes cascade). supabase-js answers { error }, never throws. */
  const undo = async (stage: string, message: string) => {
    reportError(new Error(`longform create: ${message}`), { route: '/api/video/longform', stage, jobId: id });
    let deleted = false;
    try {
      deleted = !(await svc.from('longform_jobs').delete().eq('id', id)).error;
    } catch {
      deleted = false;
    }
    // Not deleted: the stray `directing` row holds no charge, and the tick fails it at its directing deadline.
    if (!deleted) reportError(new Error('longform create: a half-written job could not be deleted'), { route: '/api/video/longform', jobId: id });
    return notQueued();
  };

  const insJob = await svc.from('longform_jobs').insert(jobRow);
  if (insJob.error) {
    reportError(new Error(`longform create: ${insJob.error.message}`), { route: '/api/video/longform', stage: 'insert_job' });
    return notQueued();
  }
  const insScenes = await svc.from('longform_scenes').insert(sceneRows);
  if (insScenes.error) return undo('insert_scenes', insScenes.error.message);
  const promoted = await svc.from('longform_jobs').update(directedColumns(Date.now())).eq('id', id).eq('status', 'directing').select('id');
  if (promoted.error) return undo('promote', promoted.error.message);
  if (!Array.isArray(promoted.data) || promoted.data.length !== 1) return undo('promote', 'the directing row was not promoted');

  return json(
    {
      id,
      status: 'planned',
      seconds: plan.seconds,
      sceneCount: plan.sceneCount,
      acts: plan.acts.length,
      tier: plan.tier,
      resolution: plan.resolution,
      format: jobRow.format,
      title: storyboard.bible.title,
      logline: storyboard.bible.logline,
      credits: { perScene: plan.credits.perScene, total: plan.credits.total },
      warnings: validation.warnings,
    },
    201,
  );
}
