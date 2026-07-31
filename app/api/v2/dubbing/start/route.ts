import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateDubbingRequest, plannedSteps, dubbingMinutes } from '@/lib/services/dubbing/dubbingPlan';
import { runDubbing } from '@/lib/services/dubbing/dubbingPipeline';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { createJob, completeJob, failJob } from '@/lib/orchestrator/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Seven legs over a multi-minute source: ffmpeg extract, an STT upload, a translation chain, one TTS call
// per line of dialogue, then two more ffmpeg passes. 600s is the ceiling MAX_SOURCE_SEC is sized against.
export const maxDuration = 600;

/**
 * Longest source we accept. Not arbitrary — a 5-minute video is roughly 60–100 lines of dialogue, which is
 * 60–100 sequential TTS calls plus three ffmpeg passes, and that is what fits inside `maxDuration`. A
 * 20-minute film would be killed mid-mix and bill the user for provider calls whose output is thrown away.
 */
const MAX_SOURCE_SEC = 300;

/**
 * POST /api/v2/dubbing/start — Master Task §2.3.2 / §4.6.
 *
 * Runs the dub SYNCHRONOUSLY and returns the finished video. Vercel has no daemon to hand the work to (see
 * the async-render note in the render architecture docs: the browser owns the job lifecycle here), so the
 * request is the worker. Progress is still published to the `generation_jobs` row, so the existing job tray
 * can show the leg-by-leg stage while this request is in flight.
 *
 * BILLING: `guardedCall` prices the job, checks the PLATFORM provider-spend budget before any provider is
 * touched, and records actual usage afterwards. That is the platform's own API spend — distinct from the
 * user's credit wallet, which dubbing does not yet charge against.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.AI);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = validateDubbingRequest(body);
  if (!parsed.ok || !parsed.request) {
    return NextResponse.json({ error: 'invalid_request', message: parsed.error }, { status: 400 });
  }
  const request = parsed.request;

  // SSRF: ffmpeg fetches this URL from inside the platform's network. A caller must not be able to point
  // the dubbing service at 169.254.169.254 or a private-range host and read the response back through an
  // error message or a rendered file.
  if (!isPublicHttpUrl(request.sourceVideoUrl)) {
    return NextResponse.json(
      { error: 'invalid_request', message: 'sourceVideoUrl must be a public http(s) URL' },
      { status: 400 },
    );
  }

  // The caller's declared length is used for PRICING and the length cap only; the pipeline re-measures the
  // real duration with ffmpeg and mixes against that, so under-declaring buys nothing but a wrong estimate.
  const declared = Number((body as { durationSec?: unknown } | null)?.durationSec);
  const durationSec = Number.isFinite(declared) && declared > 0 ? declared : 60;
  if (durationSec > MAX_SOURCE_SEC) {
    return NextResponse.json(
      {
        error: 'source_too_long',
        message: `Dubbing currently handles sources up to ${MAX_SOURCE_SEC / 60} minutes. Split the video and dub the parts.`,
        maxSourceSec: MAX_SOURCE_SEC,
      },
      { status: 413 },
    );
  }
  const minutes = dubbingMinutes(durationSec);

  const jobId = randomUUID();
  // service_type carries a DB CHECK constraint (film|avatar|interior|image|music|voice).
  // A dub OUTPUTS A VIDEO, so it files as 'film'. Filing it as 'voice' was both semantically wrong and
  // invisible: the Library excludes 'voice' (trained voice models are not playable media), so every
  // finished dub was written successfully and then hidden from the only place a user could find it.
  await createJob({
    id: jobId,
    userId: user.id,
    serviceType: 'film',
    params: { subtype: 'dubbing', targetLanguage: request.targetLanguage, minutes },
  }).catch(() => false);

  try {
    const outcome = await guardedCall(
      { service: 'dubbing', model: 'eleven-multilingual-v2', units: minutes },
      () => runDubbing(request, { jobId }),
    );

    if (!outcome.ok) {
      await failJob(jobId, `${outcome.step}: ${outcome.error}`).catch(() => {});
      return NextResponse.json(
        { error: 'dubbing_failed', step: outcome.step, message: outcome.error, jobId },
        { status: 502 },
      );
    }

    const r = outcome.result;
    await completeJob(jobId, {
      signedUrl: r.videoUrl,
      result: { videoUrl: r.videoUrl, audioUrl: r.audioUrl, subtitlesUrl: r.subtitlesUrl, subtype: 'dubbing' },
    }).catch(() => {});

    return NextResponse.json({
      jobId,
      videoUrl: r.videoUrl,
      audioUrl: r.audioUrl,
      subtitlesUrl: r.subtitlesUrl,
      detectedLanguage: r.detectedLanguage,
      targetLanguage: request.targetLanguage,
      speakers: r.speakers,
      minutes: r.minutes,
      segments: r.segments.length,
      steps: { planned: plannedSteps({ lipSync: request.lipSync }), run: r.stepsRun },
      // Surfaced, not buried: a dub with dropped or untranslated lines is a partial result and the caller
      // should be able to say so rather than presenting it as clean.
      warnings: {
        droppedLines: r.droppedLines,
        untranslatedLines: r.untranslatedLines,
        lipSyncSkipped: request.lipSync,
      },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await failJob(jobId, 'budget_exceeded').catch(() => {});
      return NextResponse.json(
        {
          error: 'budget_exceeded',
          reason: err.reason,
          message: 'The platform API budget for this period is exhausted. Please try again later.',
        },
        { status: 429 },
      );
    }
    await failJob(jobId, err instanceof Error ? err.message : 'dubbing failed').catch(() => {});
    return NextResponse.json({ error: 'dubbing_failed', jobId }, { status: 500 });
  }
}
