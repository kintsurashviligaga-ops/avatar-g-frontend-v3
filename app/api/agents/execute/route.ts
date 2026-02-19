/**
 * POST /api/agents/execute
 * Execute an agent as a job with plan/credit enforcement
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { BillingEnforcementError, deductCreditsTransaction, enforcePlanAndCredits } from '@/lib/billing/enforce';
import { createJob } from '@/lib/jobs/jobs';
import { getAgent } from '@/lib/agents/registry';
import { getCreditCost } from '../../../../lib/billing/plans';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);

    const body = await request.json();
    const { agentId, payload } = body as { agentId?: string; payload?: Record<string, unknown> };

    if (!agentId) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'agentId is required' } },
        { status: 400 }
      );
    }

    const agent = getAgent(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: { code: 'AGENT_NOT_FOUND', message: `Unknown agent: ${agentId}` } },
        { status: 404 }
      );
    }

    if (!agent.enabled) {
      return NextResponse.json(
        { error: { code: 'AGENT_DISABLED', message: `Agent ${agentId} is not currently available` } },
        { status: 403 }
      );
    }

    const actionKey = `${agentId}.orchestrate`;
    const cost = getCreditCost(actionKey, agent.baseCost);

    await enforcePlanAndCredits({
      userId: user.id,
      requiredPlan: agent.requiredPlan,
      agentId,
      cost,
    });

    const job = await createJob({
      userId: user.id,
      agentId,
      cost,
      payload: payload || {},
    });

    const idempotencyKey = request.headers.get('idempotency-key') || `job:${job.id}:deduct`;

    const deduction = await deductCreditsTransaction({
      userId: user.id,
      amount: cost,
      jobId: job.id,
      agentId,
      reason: `${agent.name} job execution`,
      idempotencyKey,
    });

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      cost,
      balance: deduction.newBalance,
    });
  } catch (error) {
    if (error instanceof BillingEnforcementError) {
      return NextResponse.json(
        error.toResponseBody(),
        { status: error.statusCode }
      );
    }

    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'AGENT_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
