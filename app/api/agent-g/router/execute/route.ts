import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase/server';
import { resolveTenantContext } from '@/lib/tenant/context';
import { routeAI } from '@/lib/ai/router';
import { recordMeteringEvent } from '@/lib/monetization/metering';
import { enforceRateLimits, MonetizationError, toPlanIdFromUnknown } from '@/lib/monetization/enforcement';
import { cacheGet, cacheSet } from '@/lib/platform/cache';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  message: z.string().min(1),
  context: z.record(z.unknown()).optional(),
  service_registry: z.array(
    z.object({
      service_id: z.string().min(1),
      capabilities: z.array(z.string()),
      providers: z.array(
        z.object({
          provider: z.string(),
          model: z.string(),
          estimated_cost_units: z.number().nonnegative(),
          expected_latency_ms: z.number().nonnegative(),
          reliability_score: z.number().min(0).max(1),
        })
      ),
    })
  ),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const tenant = await resolveTenantContext(request, user.id);
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan')
      .eq('user_id', user.id)
      .maybeSingle();
    const plan = toPlanIdFromUnknown(subscription?.plan ?? 'FREE');

    await enforceRateLimits({
      request,
      userId: user.id,
      orgId: tenant.orgId,
      plan,
      operation: 'expensive',
    });

    const body = BodySchema.parse(await request.json());
    const routingCacheKey = `ai-router:${plan}:${tenant.orgId ?? 'no-org'}:${Buffer.from(body.message).toString('base64').slice(0, 64)}`;
    const cachedRouting = await cacheGet<ReturnType<typeof routeAI> extends Promise<infer T> ? T : never>(routingCacheKey);

    const routed = cachedRouting ?? (await routeAI({
      message: body.message,
      user_id: user.id,
      org_id: tenant.orgId,
      plan,
      context: body.context,
      service_registry: body.service_registry,
    }));

    if (!cachedRouting) {
      await cacheSet(routingCacheKey, routed, 20);
    }

    await recordMeteringEvent({
      user_id: user.id,
      org_id: tenant.orgId,
      service_id: routed.selected_service_id,
      route: '/api/agent-g/router/execute',
      units: routed.estimated_cost_units,
      event_type: 'api_call',
      metadata: {
        provider: routed.selected_provider,
        model: routed.selected_model,
        execution_strategy: routed.execution_strategy,
      },
    });

    return NextResponse.json({
      plan,
      tenant: { org_id: tenant.orgId },
      routing: routed,
      cached: Boolean(cachedRouting),
    });
  } catch (error) {
    if (error instanceof MonetizationError) {
      return NextResponse.json(error.payload, { status: error.statusCode });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to execute AI routing' }, { status: 500 });
  }
}
