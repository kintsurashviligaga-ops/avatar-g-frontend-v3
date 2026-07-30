import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateMontageRequest, montageUnits, timelineDuration, MAX_TOTAL_SEC } from '@/lib/services/montage/montagePlan';
import { runMontage } from '@/lib/services/montage/montagePipeline';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { createJob, completeJob, failJob } from '@/lib/orchestrator/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Up to 12 sources, each conformed in its own ffmpeg pass, then one N-input stitch, then an optional
// music mux. MAX_TOTAL_SEC in montagePlan is sized against this ceiling.
export const maxDuration = 600;

/**
 * POST /api/v2/montage/render — automatic editing: several clips/stills cut into one master.
 *
 * Synchronous, like the other ffmpeg services here: Vercel has no daemon to hand the encode to, so the
 * request IS the worker. Progress publishes to the `generation_jobs` row for the job tray.
 *
 * NOT a hash surface. The catalogue sends users to /[locale]/montage, a real route — ServiceHub only
 * listens for `hashchange`, and a router.push to the same path with a different hash fires neither
 * hashchange nor popstate, so a hash-target tile cannot switch surface without a manual reload.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // EXPENSIVE (5/min): one call can occupy a lambda for ten minutes of CPU encode.
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = validateMontageRequest(body);
  if (!parsed.ok || !parsed.request) {
    return NextResponse.json({ error: 'invalid_request', message: parsed.error }, { status: 400 });
  }
  const request = parsed.request;

  // SSRF: ffmpeg fetches every one of these from inside the platform's network.
  for (let i = 0; i < request.shots.length; i += 1) {
    const shot = request.shots[i];
    if (shot && !isPublicHttpUrl(shot.url)) {
      return NextResponse.json(
        { error: 'invalid_request', message: `shot ${i + 1} must be a public http(s) URL` },
        { status: 400 },
      );
    }
  }
  if (request.musicUrl && !isPublicHttpUrl(request.musicUrl)) {
    return NextResponse.json({ error: 'invalid_request', message: 'musicUrl must be a public http(s) URL' }, { status: 400 });
  }

  const totalSec = timelineDuration(request.shots);
  if (totalSec > MAX_TOTAL_SEC) {
    return NextResponse.json(
      { error: 'montage_too_long', message: `The montage is ${Math.round(totalSec)}s — the limit is ${MAX_TOTAL_SEC}s.`, maxTotalSec: MAX_TOTAL_SEC },
      { status: 413 },
    );
  }

  const jobId = randomUUID();
  // service_type has a DB CHECK ('film','avatar','interior','image','music','voice') — montage rides as
  // 'film' with the real service in params.subtype, the way product/swap/motion already do.
  await createJob({
    id: jobId,
    userId: user.id,
    serviceType: 'film',
    params: { subtype: 'montage', shots: request.shots.length, aspect: request.aspect, durationSec: totalSec },
  }).catch(() => false);

  try {
    const outcome = await guardedCall(
      // Both tiers for this service are 'ffmpeg-local' — no model is called. The guard still runs so the
      // platform's compute spend is booked in the same ledger as provider spend.
      { service: 'montage', model: 'ffmpeg-local', units: montageUnits() },
      () => runMontage(request, { jobId }),
    );

    if (!outcome.ok) {
      await failJob(jobId, `${outcome.step}: ${outcome.error}`).catch(() => {});
      return NextResponse.json(
        { error: 'montage_failed', step: outcome.step, message: outcome.error, jobId },
        { status: 502 },
      );
    }

    const r = outcome.result;
    await completeJob(jobId, {
      signedUrl: r.videoUrl,
      result: { videoUrl: r.videoUrl, subtype: 'montage', durationSec: r.durationSec, aspect: r.aspect },
    }).catch(() => {});

    return NextResponse.json({
      jobId,
      videoUrl: r.videoUrl,
      durationSec: r.durationSec,
      shots: r.shots,
      aspect: r.aspect,
      bridged: r.bridged,
      steps: r.stepsRun,
      // A requested bed that did not mix is stated rather than silently absent.
      warnings: { musicRequestedButMissing: Boolean(request.musicUrl) && !r.hasMusic },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await failJob(jobId, 'budget_exceeded').catch(() => {});
      return NextResponse.json(
        { error: 'budget_exceeded', reason: err.reason, message: 'The platform budget for this period is exhausted. Please try again later.' },
        { status: 429 },
      );
    }
    await failJob(jobId, err instanceof Error ? err.message : 'montage failed').catch(() => {});
    return NextResponse.json({ error: 'montage_failed', jobId }, { status: 500 });
  }
}
