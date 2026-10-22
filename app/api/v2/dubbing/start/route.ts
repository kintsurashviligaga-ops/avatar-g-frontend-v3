import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateDubbingRequest, plannedSteps, dubbingMinutes } from '@/lib/services/dubbing/dubbingPlan';
import { runDubbing } from '@/lib/services/dubbing/dubbingPipeline';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { resolveUploadRef } from '@/lib/services/resolveUpload';
import { extractAudioTrack } from '@/lib/services/dubbing/dubbingFfmpeg';
import { creditCostFor, CREDIT_COSTS } from '@/lib/credits/pricing';
import { ownerApprovedPrice, issueServiceQuote, wantsToConfirm } from '@/lib/billing/paidServiceGate';
import { startConfirmedJob, persistCompletion } from '@/lib/orchestrator/confirmedJob';
import { reportError } from '@/lib/observability/report-error';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';

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
 * BILLING (final P0/P1 repair run — see lib/billing/paidServiceGate and lib/orchestrator/confirmedJob):
 *   · OFF until the owner approves the price (`OWNER_APPROVED_PRICING=dubbing:10`) — refused before ffmpeg or any provider;
 *   · the source is MEASURED on the server (the ffmpeg extract, no provider spend) and priced per started minute of the
 *     measured length — the client's `durationSec` is ignored, so under-declaring buys nothing and no top-up debit
 *     exists that could fail after the provider was paid;
 *   · a POST without a token is a QUOTE (signed, nothing charged); only `{ quoteToken, confirm: true }` runs, at most
 *     once per quote (job row keyed by the quote's job id + replay-refusing charge ref `dubbing:<jobId>`);
 *   · refunded once (`…:refund`) when the dub fails; a refund that does not land leaves the job for the drainer.
 * `guardedCall` separately checks the PLATFORM provider-spend budget.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.AI);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Admin service switch (lib/server/serviceSwitches): a switched-off tool is refused here, before any charge.
  const serviceOff = await serviceOffResponse('dubbing');
  if (serviceOff) return serviceOff;

  const raw = await req.json().catch(() => null);

  // The browser uploads the source video straight to storage (a serverless body cannot carry 40MB), so
  // what arrives here is a storage PATH. Sign it before validation — otherwise the validator's
  // `^https?://` rule rejects the only thing the upload flow can produce, which is why this service
  // used to demand a public link the user did not have. See lib/services/resolveUpload.
  const body = raw && typeof raw === 'object'
    ? { ...(raw as Record<string, unknown>), sourceVideoUrl: await resolveUploadRef((raw as Record<string, unknown>).sourceVideoUrl, user.id) }
    : raw;

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

  // Not approved by the owner ⇒ the service is unavailable, before any ffmpeg pass, provider or ledger call.
  if (!ownerApprovedPrice('dubbing', CREDIT_COSTS.dubbing_per_minute)) {
    return NextResponse.json(
      { error: 'service_unavailable', reason: 'pricing_not_approved', message: 'Dubbing is not available yet.' },
      { status: 503 },
    );
  }
  // The per-account daily ceiling still bounds one person's provider spend; counted only for a request that passed
  // validation.
  const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.DUBBING_USER);
  if (capped) return capped;

  // MEASURE, then price. The extract is ffmpeg on our side (no provider), and the pipeline reuses this exact track, so
  // the priced length and the dubbed length are the same number.
  const extracted = await extractAudioTrack(request.sourceVideoUrl);
  const durationSec = extracted?.durationSec ?? 0;
  if (!extracted || !(durationSec > 0)) {
    return NextResponse.json(
      { error: 'duration_unmeasurable', message: 'Could not read the length of the video — nothing was charged.' },
      { status: 422 },
    );
  }
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
  const cost = creditCostFor('dubbing', { seconds: durationSec });

  // No token ⇒ a quote: nothing reserved, nothing run. The panel shows the price and a Confirm button.
  if (!wantsToConfirm(raw)) {
    const quote = issueServiceQuote({ service: 'dubbing', userId: user.id, raw, credits: cost, units: minutes, jobId: randomUUID(), now: Date.now() });
    if (!quote) return NextResponse.json({ error: 'billing_unavailable' }, { status: 503 });
    return NextResponse.json({ requiresConfirm: true, quote: { ...quote, minutes, durationSec: Math.ceil(durationSec) } });
  }

  // service_type carries a DB CHECK constraint (film|avatar|interior|image|music|voice).
  // A dub OUTPUTS A VIDEO, so it files as 'film'. Filing it as 'voice' was both semantically wrong and
  // invisible: the Library excludes 'voice' (trained voice models are not playable media), so every
  // finished dub was written successfully and then hidden from the only place a user could find it.
  const started = await startConfirmedJob({
    service: 'dubbing',
    userId: user.id,
    raw,
    credits: cost,
    units: minutes,
    serviceType: 'film',
    params: { subtype: 'dubbing', targetLanguage: request.targetLanguage, minutes },
  });
  if (!started.ok) return started.response;
  const { jobId, reservation, refundAndFail } = started.job;

  try {
    const outcome = await guardedCall(
      { service: 'dubbing', model: 'eleven-multilingual-v2', units: minutes },
      () => runDubbing(request, { jobId, extracted }),
    );

    if (!outcome.ok) {
      const { refunded } = await refundAndFail(`${outcome.step}: ${outcome.error}`);
      return NextResponse.json(
        { error: 'dubbing_failed', step: outcome.step, message: outcome.error, jobId, refunded, refundPending: !refunded },
        { status: 502 },
      );
    }

    const r = outcome.result;
    // Same track, same measure: the dub cannot be longer than what was priced. Should that ever break, it is an alert,
    // never a silent second debit after the provider was paid.
    if (r.minutes > minutes) reportError(new Error('dub measured longer than priced'), { route: 'dubbing/start', jobId, priced: minutes, dubbed: r.minutes });
    const persisted = await persistCompletion(jobId, {
      signedUrl: r.videoUrl,
      result: { videoUrl: r.videoUrl, audioUrl: r.audioUrl, subtitlesUrl: r.subtitlesUrl, subtype: 'dubbing' },
    });

    return NextResponse.json({
      jobId,
      // A result that is not durably recorded is NOT reported as a completed job: download it now.
      status: persisted ? 'completed' : 'unpersisted',
      persisted,
      videoUrl: r.videoUrl,
      audioUrl: r.audioUrl,
      subtitlesUrl: r.subtitlesUrl,
      detectedLanguage: r.detectedLanguage,
      targetLanguage: request.targetLanguage,
      speakers: r.speakers,
      minutes: r.minutes,
      creditsCharged: reservation.charged ? cost : 0,
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
      const { refunded } = await refundAndFail('budget_exceeded');
      return NextResponse.json(
        {
          error: 'budget_exceeded',
          reason: err.reason,
          message: 'The platform API budget for this period is exhausted. Please try again later.',
          refunded,
        },
        { status: 429 },
      );
    }
    const { refunded } = await refundAndFail(err instanceof Error ? err.message : 'dubbing failed');
    return NextResponse.json({ error: 'dubbing_failed', jobId, refunded, refundPending: !refunded }, { status: 500 });
  }
}
