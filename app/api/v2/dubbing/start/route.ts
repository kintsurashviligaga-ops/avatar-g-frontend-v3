import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateDubbingRequest, plannedSteps, dubbingMinutes } from '@/lib/services/dubbing/dubbingPlan';
import { canProceed } from '@/lib/services/billing/BillingGuard';
import { estimateCost } from '@/lib/services/billing/costModel';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/v2/dubbing/start — Master Task §2.3.2 / §4.6.
 *
 * Validates the request, prices it, and checks the platform budget BEFORE any provider is touched. Dubbing
 * is the most expensive service per unit in the catalogue (7 provider legs over every minute of source), so
 * a request that cannot be paid for must be refused at the door rather than half-way through leg four.
 *
 * SCOPE — this is the door, not the pipeline. The seven legs (ffmpeg extract → ElevenLabs Scribe →
 * Gemini translate → cloned-voice TTS → sync → mix → optional lip-sync) are not wired yet; the route
 * answers 501 with the plan it WOULD run so the contract, validation, pricing and budget gate are
 * exercisable now and the worker can be dropped in behind an unchanged interface.
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

  // Price it. `durationSec` is the caller's declared source length; absent → assume one minute so an
  // unmeasured video is never treated as free.
  const durationSec = Number((body as { durationSec?: unknown } | null)?.durationSec);
  const minutes = dubbingMinutes(Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 60);
  const estimate = estimateCost({ service: 'dubbing', model: 'eleven-multilingual-v2', units: minutes });

  const decision = await canProceed(estimate);
  if (!decision.allowed) {
    return NextResponse.json(
      {
        error: 'budget_exceeded',
        reason: decision.reason,
        message: 'The platform API budget for this period is exhausted. Please try again later.',
      },
      { status: 429 },
    );
  }

  return NextResponse.json(
    {
      error: 'not_implemented',
      message: 'Dubbing pipeline legs are not wired yet. Request validated, priced and budget-checked.',
      plan: {
        steps: plannedSteps({ lipSync: parsed.request.lipSync }),
        request: parsed.request,
        minutes,
        estimatedCostUsd: estimate.estimatedCost,
      },
    },
    { status: 501 },
  );
}
