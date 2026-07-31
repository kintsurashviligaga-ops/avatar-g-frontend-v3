import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateDeckRequest, deckUnits } from '@/lib/services/presentation/deckPlan';
import { runDeckBuild } from '@/lib/services/presentation/deckPipeline';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { createJob, completeJob, failJob } from '@/lib/orchestrator/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Outline + up to 12 sequential Imagen calls + 13 resvg rasterisations.
export const maxDuration = 300;

/**
 * POST /api/v2/presentation/build — topic in, rendered deck out.
 *
 * STORYBOARD rate limit (30/min), not EXPENSIVE (5/min): this is the same shape as the storyboard route —
 * one outline plus a per-item image fan-out — and at 5/min a 12-slide deck would 429 itself mid-build.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.STORYBOARD);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = validateDeckRequest(body);
  if (!parsed.ok || !parsed.request) {
    return NextResponse.json({ error: 'invalid_request', message: parsed.error }, { status: 400 });
  }
  const request = parsed.request;

  // No SSRF surface here: every input is text, and the only URLs fetched are ones this server generated.
  const jobId = randomUUID();
  await createJob({
    id: jobId,
    userId: user.id,
    serviceType: 'image',
    params: { subtype: 'presentation', slides: request.slideCount, language: request.language },
  }).catch(() => false);

  try {
    const outcome = await guardedCall(
      // NOTE: the outline call books its own spend inside llmText. This guard covers the Imagen fan-out
      // and the deck as a billable unit — it deliberately does not wrap the outline a second time.
      { service: 'presentation', model: 'gemini-imagen', units: deckUnits() },
      () => runDeckBuild(request, { jobId }),
    );

    if (!outcome.ok) {
      await failJob(jobId, `${outcome.step}: ${outcome.error}`).catch(() => {});
      return NextResponse.json(
        { error: 'deck_failed', step: outcome.step, message: outcome.error, jobId },
        { status: 502 },
      );
    }

    const r = outcome.result;
    await completeJob(jobId, {
      signedUrl: r.coverUrl ?? r.slides[0]?.pngUrl ?? null,
      result: { subtype: 'presentation', slides: r.slides.length, coverUrl: r.coverUrl },
    }).catch(() => {});

    return NextResponse.json({
      jobId,
      title: r.deck.title,
      language: r.deck.language,
      theme: r.deck.theme,
      coverUrl: r.coverUrl,
      slides: r.slides,
      steps: r.stepsRun,
      // Both degradations are stated rather than passed off as a clean deck.
      warnings: {
        usedFallbackOutline: r.usedFallbackOutline,
        imagesMissing: r.imagesMissing,
        imagesRequested: r.imagesRequested,
      },
    });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      await failJob(jobId, 'budget_exceeded').catch(() => {});
      return NextResponse.json(
        { error: 'budget_exceeded', reason: err.reason, message: 'The platform budget for this period is exhausted. Please try again later.' },
        { status: 429 },
      );
    }
    await failJob(jobId, err instanceof Error ? err.message : 'deck build failed').catch(() => {});
    return NextResponse.json({ error: 'deck_failed', jobId }, { status: 500 });
  }
}
