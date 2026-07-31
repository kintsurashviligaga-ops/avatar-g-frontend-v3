import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { validateModel3dRequest, model3dUnits, QUALITY_MODEL } from '@/lib/services/model3d/model3dPlan';
import { submitReconstruction, hasReplicate3dProvider } from '@/lib/services/model3d/replicate3dClient';
import { generateImagenImages, mapImagenAspect, hasGeminiImagenProvider } from '@/lib/ai/geminiImagen';
import { uploadBufferAndSign } from '@/lib/orchestrator/storage-adapter';
import { guardedCall, BudgetExceededError } from '@/lib/services/billing/guardedCall';
import { isPublicHttpUrl } from '@/lib/security/allowlistedAudioFetch';
import { resolveUploadRef } from '@/lib/services/resolveUpload';
import { createJob } from '@/lib/orchestrator/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Text mode does an Imagen call before submitting; the reconstruction itself is polled from the browser.
export const maxDuration = 120;

const WEEK_SEC = 604_800;

/**
 * POST /api/v2/model3d/create — submit a 3D reconstruction, return the poll handle.
 *
 * BACKEND: Replicate (TRELLIS). Meshy was the original spec but has no API key on any environment.
 *
 * TEXT MODE IS TWO HOPS: the strong open 3D models are IMAGE-to-3D, so a text prompt first becomes a
 * reference image via Imagen 4, which is then reconstructed. The reference URL is returned so the UI can
 * show what the mesh is actually being built from.
 *
 * SUBMIT-THEN-POLL: reconstruction takes minutes, past any lambda budget, so the browser drives
 * /api/v2/model3d/status — the same lifecycle the film studio uses for Veo.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const limited = await checkRateLimit(req, RATE_LIMITS.EXPENSIVE);
  if (limited) return limited;

  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = await req.json().catch(() => null);

  // Same as dubbing: the image-to-3D reference is uploaded browser-direct to storage, so it arrives as
  // a PATH. Signing it here is what lets the panel offer a real file picker instead of demanding a URL.
  const body = raw && typeof raw === 'object'
    ? { ...(raw as Record<string, unknown>), imageUrl: await resolveUploadRef((raw as Record<string, unknown>).imageUrl) }
    : raw;

  const parsed = validateModel3dRequest(body);
  if (!parsed.ok || !parsed.request) {
    return NextResponse.json({ error: 'invalid_request', message: parsed.error }, { status: 400 });
  }
  const request = parsed.request;

  // Honest failure BEFORE anything is charged or a job row is written.
  if (!hasReplicate3dProvider()) {
    return NextResponse.json(
      { error: 'provider_not_configured', message: '3D generation is unavailable — REPLICATE_API_TOKEN is not configured on this deployment.' },
      { status: 503 },
    );
  }
  if (request.mode === 'text' && !hasGeminiImagenProvider()) {
    return NextResponse.json(
      { error: 'provider_not_configured', message: 'Text-to-3D needs the image provider, which is not configured. Upload a photo instead.' },
      { status: 503 },
    );
  }

  // SSRF: Replicate fetches this URL, but we refuse a private-range host here rather than have a third
  // party probe our network on a caller's behalf.
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
    let referenceUrl = request.imageUrl ?? '';

    if (request.mode === 'text') {
      const images = await generateImagenImages({
        // A clean, centred, single-subject reference reconstructs far better than a scene.
        prompt: `${request.prompt}. A single centred object, plain neutral background, even studio lighting, full object visible, product photo.`,
        aspectRatio: mapImagenAspect('1:1'),
        numberOfImages: 1,
        ...(request.negativePrompt ? { negativePrompt: request.negativePrompt } : {}),
      }).catch(() => null);
      const first = images?.[0];
      if (!first) {
        return NextResponse.json({ error: 'reference_failed', message: 'the reference image could not be generated', jobId }, { status: 502 });
      }
      // Must be publicly fetchable — Replicate pulls it from its own network.
      const hosted = await uploadBufferAndSign(
        'renders',
        `models3d/ref-${jobId}.png`,
        first.buffer,
        first.mimeType || 'image/png',
        WEEK_SEC,
      );
      if (!hosted) {
        return NextResponse.json({ error: 'reference_failed', message: 'the reference image could not be stored', jobId }, { status: 502 });
      }
      referenceUrl = hosted;
    }

    const submitted = await guardedCall(
      {
        service: 'model3d',
        model: QUALITY_MODEL[request.quality],
        units: model3dUnits(),
        // ⚠️ BOOK NOTHING FOR A SUBMIT THAT NEVER REACHED THE PROVIDER.
        //
        // guardedCall books its estimate on whatever fn() RETURNS, and its own comment says booking
        // happens "after a SUCCESSFUL call" — but submitReconstruction never throws BY DESIGN: a bad
        // token, a 4xx, a non-JSON body and a timeout all come back as { ok:false }. So every failed
        // submission still charged the full $0.10 model3d estimate against the platform envelope. An
        // unfunded or misconfigured Replicate token would drain the budget on requests that produced
        // nothing, tripping the ladder into economy / free_tier_restricted early and degrading services
        // for everyone. A failed submit costs zero, and is now booked as zero.
        actualCost: (r) => ((r as { ok?: boolean } | null)?.ok === false ? 0 : undefined),
      },
      () => submitReconstruction(referenceUrl, request),
    );

    if (!submitted.ok) {
      return NextResponse.json(
        { error: 'submit_failed', message: submitted.error, retryable: submitted.retryable, jobId },
        { status: submitted.retryable ? 503 : 502 },
      );
    }

    // The job row stays 'processing'; the status route completes it.
    return NextResponse.json({
      jobId,
      predictionId: submitted.predictionId,
      pollUrl: submitted.pollUrl,
      referenceUrl,
    });
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
