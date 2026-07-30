import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateModel3dRequest, model3dUnits } from '@/lib/services/model3d/meshyPlan';
import { submitMeshyTask, hasMeshyProvider, meshyModelFor } from '@/lib/services/model3d/meshyClient';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { createJob } from '@/lib/orchestrator/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Submit only — the generation itself runs on Meshy and is polled from the browser.
export const maxDuration = 60;

/**
 * POST /api/v2/model3d/create — submit a text/image-to-3D job, return the task id.
 *
 * SUBMIT-THEN-POLL, the same lifecycle Veo uses here: text-to-3D takes minutes, far beyond any lambda
 * budget, so this route only enqueues and the browser drives /api/v2/model3d/status.
 *
 * ⚠️ NOT VERIFIED AGAINST THE LIVE API — this project has no MESHY_API_KEY. Without one the route answers
 * a clear 503 rather than pretending to work, and the catalogue tile stays "coming soon".
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = validateModel3dRequest(body);
  if (!parsed.ok || !parsed.request) {
    return NextResponse.json({ error: 'invalid_request', message: parsed.error }, { status: 400 });
  }
  const request = parsed.request;

  // Honest failure BEFORE anything is charged or a job row is written.
  if (!hasMeshyProvider()) {
    return NextResponse.json(
      {
        error: 'provider_not_configured',
        message: '3D generation is not available yet — the Meshy API key is not configured on this deployment.',
      },
      { status: 503 },
    );
  }

  // SSRF: Meshy fetches image-to-3D sources, but this server also validates them so a private-range URL
  // is refused here rather than probed from a third party on our behalf.
  if (request.mode === 'image' && request.imageUrl && !isPublicHttpUrl(request.imageUrl)) {
    return NextResponse.json({ error: 'invalid_request', message: 'imageUrl must be a public http(s) URL' }, { status: 400 });
  }

  const jobId = randomUUID();
  // service_type DB CHECK ('film','avatar','interior','image','music','voice') — 3D rides as 'image'.
  await createJob({
    id: jobId,
    userId: user.id,
    serviceType: 'image',
    params: { subtype: 'model3d', mode: request.mode, quality: request.quality },
  }).catch(() => false);

  try {
    const submitted = await guardedCall(
      { service: 'model3d', model: meshyModelFor(request), units: model3dUnits() },
      () => submitMeshyTask(request),
    );

    if (!submitted.ok) {
      return NextResponse.json(
        { error: 'submit_failed', message: submitted.error, retryable: submitted.retryable, jobId },
        { status: submitted.retryable ? 503 : 502 },
      );
    }

    // The job row stays 'processing' — the status route completes it once Meshy finishes.
    return NextResponse.json({ jobId, taskId: submitted.taskId, mode: request.mode });
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: 'budget_exceeded', reason: err.reason, message: 'The platform budget for this period is exhausted. Please try again later.' },
        { status: 429 },
      );
    }
    return NextResponse.json({ error: 'submit_failed', jobId }, { status: 500 });
  }
}
