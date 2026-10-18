import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, checkRateLimitByKey, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateDeckRequest, deckUnits } from '@/lib/services/presentation/deckPlan';
import { runDeckBuild } from '@/lib/services/presentation/deckPipeline';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { creditCostFor, CREDIT_COSTS } from '@/lib/credits/pricing';
import { ownerApprovedPrice, issueServiceQuote, wantsToConfirm } from '@/lib/billing/paidServiceGate';
import { startConfirmedJob, persistCompletion } from '@/lib/orchestrator/confirmedJob';
import { serviceOffResponse } from '@/lib/server/serviceSwitches';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Outline + up to 12 sequential Imagen calls + 13 resvg rasterisations.
export const maxDuration = 300;

/**
 * POST /api/v2/presentation/build — topic in, rendered deck out.
 *
 * STORYBOARD rate limit (30/min), not EXPENSIVE (5/min): this is the same shape as the storyboard route —
 * one outline plus a per-item image fan-out — and at 5/min a 12-slide deck would 429 itself mid-build.
 *
 * BILLING (final P0/P1 repair run): OFF until the owner approves the price (`OWNER_APPROVED_PRICING=presentation:15`);
 * a POST without a token is a signed QUOTE (nothing charged); `{ quoteToken, confirm: true }` builds at most once per
 * quote, reserving before any provider call and refunding once on failure (lib/orchestrator/confirmedJob).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.STORYBOARD);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  // Admin service switch (lib/server/serviceSwitches): a switched-off tool is refused here, before any charge.
  const serviceOff = await serviceOffResponse('presentation');
  if (serviceOff) return serviceOff;

  const body = await req.json().catch(() => null);
  const parsed = validateDeckRequest(body);
  if (!parsed.ok || !parsed.request) {
    return NextResponse.json({ error: 'invalid_request', message: parsed.error }, { status: 400 });
  }
  const request = parsed.request;
  if (!ownerApprovedPrice('presentation', CREDIT_COSTS.presentation_deck)) {
    return NextResponse.json(
      { error: 'service_unavailable', reason: 'pricing_not_approved', message: 'Presentations are not available yet.' },
      { status: 503 },
    );
  }
  // The per-account daily ceiling still bounds one person's Gemini and image spend.
  const capped = await checkRateLimitByKey(user.id, RATE_LIMITS.PRESENTATION_USER);
  if (capped) return capped;

  // No SSRF surface here: every input is text, and the only URLs fetched are ones this server generated.
  const cost = creditCostFor('presentation');
  if (!wantsToConfirm(body)) {
    const quote = issueServiceQuote({ service: 'presentation', userId: user.id, raw: body, credits: cost, jobId: randomUUID(), now: Date.now() });
    if (!quote) return NextResponse.json({ error: 'billing_unavailable' }, { status: 503 });
    return NextResponse.json({ requiresConfirm: true, quote });
  }
  const started = await startConfirmedJob({
    service: 'presentation',
    userId: user.id,
    raw: body,
    credits: cost,
    serviceType: 'image',
    params: { subtype: 'presentation', slides: request.slideCount, language: request.language },
  });
  if (!started.ok) return started.response;
  const { jobId, reservation, refundAndFail } = started.job;

  try {
    const outcome = await guardedCall(
      // NOTE: the outline call books its own spend inside llmText. This guard covers the Imagen fan-out
      // and the deck as a billable unit — it deliberately does not wrap the outline a second time.
      { service: 'presentation', model: 'gemini-imagen', units: deckUnits() },
      () => runDeckBuild(request, { jobId }),
    );

    if (!outcome.ok) {
      const { refunded } = await refundAndFail(`${outcome.step}: ${outcome.error}`);
      return NextResponse.json(
        { error: 'deck_failed', step: outcome.step, message: outcome.error, jobId, refunded, refundPending: !refunded },
        { status: 502 },
      );
    }

    const r = outcome.result;
    const persisted = await persistCompletion(jobId, {
      signedUrl: r.coverUrl ?? r.slides[0]?.pngUrl ?? null,
      // ⚠️ ONLY THE COUNT WAS STORED, SO THE DECK WAS UNRECOVERABLE. `slides: r.slides.length` persisted
      // the NUMBER of slides and threw the slides away; SlidesStudio held them in component state. After
      // a reload the user could recover exactly one cover image from a deck they had paid for. The pages
      // are now persisted, so the Library and a re-opened panel can both rebuild the whole deck.
      result: {
        subtype: 'presentation',
        slideCount: r.slides.length,
        coverUrl: r.coverUrl,
        // `url` is what app/api/studio/library/route.ts's pickUrl falls back to when signed_url is null;
        // without it a completed deck is silently dropped from the Library listing.
        url: r.coverUrl ?? r.slides[0]?.pngUrl ?? null,
        slides: r.slides.map((sl) => ({ index: sl.index, pngUrl: sl.pngUrl })),
      },
    });

    return NextResponse.json({
      jobId,
      // Not durably recorded ⇒ not reported as a completed job (the Library could not rebuild it): save it now.
      status: persisted ? 'completed' : 'unpersisted',
      persisted,
      title: r.deck.title,
      language: r.deck.language,
      theme: r.deck.theme,
      coverUrl: r.coverUrl,
      slides: r.slides,
      steps: r.stepsRun,
      creditsCharged: reservation.charged ? cost : 0,
      // Both degradations are stated rather than passed off as a clean deck.
      warnings: {
        usedFallbackOutline: r.usedFallbackOutline,
        imagesMissing: r.imagesMissing,
        imagesRequested: r.imagesRequested,
      },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      const { refunded } = await refundAndFail('budget_exceeded');
      return NextResponse.json(
        { error: 'budget_exceeded', reason: err.reason, message: 'The platform budget for this period is exhausted. Please try again later.', refunded },
        { status: 429 },
      );
    }
    const { refunded } = await refundAndFail(err instanceof Error ? err.message : 'deck build failed');
    return NextResponse.json({ error: 'deck_failed', jobId, refunded, refundPending: !refunded }, { status: 500 });
  }
}
