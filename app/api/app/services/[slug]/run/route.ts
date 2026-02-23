import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getServiceBySlug } from '@/lib/app/services';
import {
  BillingEnforcementError,
  deductCreditsTransaction,
  enforcePlanAndCredits,
  getBillingSnapshot,
} from '@/lib/billing/enforce';
import { getCreditCost, type PlanTier } from '@/lib/billing/plans';
import { checkRateLimit, getRateLimitForPlan } from '@/lib/api/rate-limit';
import { resolveTenantContext } from '@/lib/tenant/context';
import { enforceRateLimits, MonetizationError, toPlanIdFromUnknown } from '@/lib/monetization/enforcement';
import { resolveQueueName, assertQueueConcurrency } from '@/lib/jobs/queue-policy';
import { recordMeteringEvent } from '@/lib/monetization/metering';
import { logRouteExecution } from '@/lib/observability/runtime';

export const dynamic = 'force-dynamic';

type ImageResolutionKey = '1:1 Square' | '16:9 Landscape' | '9:16 Portrait' | '512x512' | '768x768' | '1024x1024';

type ImagePayload = {
  prompt: string;
  style: string;
  resolution: ImageResolutionKey;
  width: number;
  height: number;
  template?: string;
};

type TextPayload = {
  prompt: string;
  feature: 'summarize' | 'translate' | 'seo' | 'sentiment';
};

const IMAGE_RESOLUTION_MAP: Record<ImageResolutionKey, { width: number; height: number }> = {
  '1:1 Square': { width: 1024, height: 1024 },
  '16:9 Landscape': { width: 1024, height: 576 },
  '9:16 Portrait': { width: 576, height: 1024 },
  '512x512': { width: 512, height: 512 },
  '768x768': { width: 768, height: 768 },
  '1024x1024': { width: 1024, height: 1024 },
};

const PLAN_IMAGE_MAX_SIDE: Record<PlanTier, number> = {
  FREE: 768,
  PRO: 1024,
  PREMIUM: 1024,
  ENTERPRISE: 1024,
};

const PLAN_QUEUE_PRIORITY: Record<PlanTier, 'low' | 'normal' | 'high' | 'critical'> = {
  FREE: 'low',
  PRO: 'normal',
  PREMIUM: 'high',
  ENTERPRISE: 'critical',
};

function normalizeImagePayload(prompt: string, inputPayload?: Record<string, unknown>): ImagePayload | null {
  const style = String(inputPayload?.style ?? 'realistic');
  const resolutionCandidate = String(inputPayload?.resolution ?? '768x768');
  if (!(resolutionCandidate in IMAGE_RESOLUTION_MAP)) return null;
  const resolution = resolutionCandidate as ImageResolutionKey;
  const mapped = IMAGE_RESOLUTION_MAP[resolution];
  return {
    prompt,
    style,
    resolution,
    width: mapped.width,
    height: mapped.height,
    template: inputPayload?.template ? String(inputPayload.template) : undefined,
  };
}

function normalizeTextPayload(prompt: string, inputPayload?: Record<string, unknown>): TextPayload {
  const featureRaw = String(inputPayload?.feature ?? 'summarize');
  const allowed = new Set(['summarize', 'translate', 'seo', 'sentiment']);
  return {
    prompt,
    feature: (allowed.has(featureRaw) ? featureRaw : 'summarize') as TextPayload['feature'],
  };
}

export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await resolveTenantContext(request, user.id);
    const billingSnapshot = await getBillingSnapshot(user.id);
    const canonicalPlan = toPlanIdFromUnknown(billingSnapshot.plan);

    await enforceRateLimits({
      request,
      userId: user.id,
      orgId: tenant.orgId,
      plan: canonicalPlan,
      operation: 'expensive',
    });

    const rateLimitError = await checkRateLimit(request, getRateLimitForPlan(billingSnapshot.plan, 'expensive'));
    if (rateLimitError) {
      return rateLimitError;
    }

    const service = getServiceBySlug(params.slug);
    if (!service) {
      return NextResponse.json({ error: 'Unknown service slug' }, { status: 404 });
    }

    const body = (await request.json()) as {
      prompt?: string;
      inputPayload?: Record<string, unknown>;
    };

    const prompt = String(body.prompt ?? '').trim();
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const cost = getCreditCost(`${service.slug}.generate`, service.credits);
    const billing = await enforcePlanAndCredits({
      userId: user.id,
      requiredPlan: 'FREE',
      agentId: service.slug,
      cost,
    });

    const queueName = resolveQueueName({
      plan: toPlanIdFromUnknown(billing.plan),
      serviceSlug: service.slug,
    });

    await assertQueueConcurrency({
      userId: user.id,
      orgId: tenant.orgId,
      plan: toPlanIdFromUnknown(billing.plan),
      queue: queueName,
    });

    const queuePriority = PLAN_QUEUE_PRIORITY[billing.plan];

    const inputPayload: Record<string, unknown> = {
      prompt,
      ...(body.inputPayload ?? {}),
      queue_priority: queuePriority,
      plan_tier: billing.plan,
    };

    if (service.slug === 'image-creator') {
      const imagePayload = normalizeImagePayload(prompt, body.inputPayload);
      if (!imagePayload) {
        return NextResponse.json({
          error: 'Invalid image resolution value',
          code: 'INVALID_IMAGE_RESOLUTION',
        }, { status: 400 });
      }

      if (Math.max(imagePayload.width, imagePayload.height) > PLAN_IMAGE_MAX_SIDE[billing.plan]) {
        return NextResponse.json({
          error: 'Resolution exceeds your plan limit',
          current_plan: billing.plan,
        }, { status: 403 });
      }

      Object.assign(inputPayload, imagePayload);
    }

    if (service.slug === 'text-intelligence') {
      Object.assign(inputPayload, normalizeTextPayload(prompt, body.inputPayload));
    }

    const { data: job, error: createJobError } = await supabase
      .from('service_jobs')
      .insert({
        user_id: user.id,
        org_id: tenant.orgId,
        service_slug: service.slug,
        title: `${service.name} run`,
        queue_name: queueName,
        status: 'queued',
        progress: 0,
        input_payload: inputPayload,
        max_attempts: 3,
        attempt_count: 0,
        heartbeat_at: new Date().toISOString(),
      })
      .select('*')
      .single();

    if (createJobError || !job) {
      return NextResponse.json({ error: createJobError?.message ?? 'Failed to create job' }, { status: 500 });
    }

    await deductCreditsTransaction({
      userId: user.id,
      amount: cost,
      jobId: job.id,
      agentId: service.slug,
      reason: `${service.name} run`,
      idempotencyKey: `service-job:${job.id}:${service.slug}`,
    });

    await Promise.all([
      recordMeteringEvent({
        user_id: user.id,
        org_id: tenant.orgId,
        service_id: service.slug,
        route: '/api/app/services/[slug]/run',
        units: cost,
        event_type: 'job_enqueue',
        metadata: { job_id: job.id, queue: queueName, request_id: requestId },
      }),
      logRouteExecution({
        request_id: requestId,
        user_id: user.id,
        org_id: tenant.orgId,
        route: '/api/app/services/[slug]/run',
        duration_ms: Date.now() - startedAt,
        status_code: 200,
        plan: billing.plan,
      }),
    ]);

    return NextResponse.json({
      job,
      queue: {
        status: 'queued',
        name: queueName,
        priority: queuePriority,
      },
      billing: {
        plan: billing.plan,
        creditsBalance: billing.credits.balance - cost,
        creditsSpent: cost,
      },
    });
  } catch (error) {
    if (error instanceof BillingEnforcementError) {
      return NextResponse.json(error.toResponseBody(), { status: error.statusCode });
    }

    if (error instanceof MonetizationError) {
      return NextResponse.json(error.payload, { status: error.statusCode });
    }

    return NextResponse.json({ error: 'Service run failed' }, { status: 500 });
  }
}
