/**
 * POST /api/agents/execute
 * Pipeline execution entry point — routes through Agent G Router.
 * Preserves billing enforcement from existing implementation.
 */

import { z } from 'zod'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuthenticatedUser } from '@/lib/supabase/auth'
import { BillingEnforcementError, deductCreditsTransaction, enforcePlanAndCredits } from '@/lib/billing/enforce'
import { getAgent } from '@/lib/agents/registry'
import { getCreditCost } from '@/lib/billing/plans'
import { agentGRouter } from '@/lib/agents/agentGRouter'
import type { BundleType } from '@/types/agents'

export const dynamic = 'force-dynamic'

const ExecuteSchema = z.object({
  service_id: z.string().min(1),
  intake: z.record(z.unknown()).default({}),
  mode: z.enum(['single', 'bundle']),
  bundle_type: z.string().optional() as z.ZodType<BundleType | undefined>,
  project_id: z.string().uuid().optional(),
  // Legacy compat
  agentId: z.string().optional(),
  payload: z.record(z.unknown()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request)
    const raw = await request.json()
    const body = ExecuteSchema.parse(raw)

    // Resolve agent ID from service_id or legacy agentId
    const resolvedAgentId = body.agentId ?? body.service_id
    const agent = getAgent(resolvedAgentId)
    if (!agent) {
      return NextResponse.json(
        { error: { code: 'AGENT_NOT_FOUND', message: `Unknown agent: ${resolvedAgentId}` } },
        { status: 404 }
      )
    }

    if (!agent.enabled) {
      return NextResponse.json(
        { error: { code: 'AGENT_DISABLED', message: `Agent ${resolvedAgentId} is not currently available` } },
        { status: 403 }
      )
    }

    // Billing enforcement
    const actionKey = `${resolvedAgentId}.orchestrate`
    const cost = getCreditCost(actionKey, agent.baseCost)

    await enforcePlanAndCredits({
      userId: user.id,
      requiredPlan: agent.requiredPlan,
      agentId: resolvedAgentId,
      cost,
    })

    // Route through Agent G
    const plan = await agentGRouter.buildAndDispatch({
      userId: user.id,
      serviceId: body.service_id,
      intake: body.intake,
      mode: body.mode,
      bundleType: body.bundle_type,
      projectId: body.project_id,
    })

    // Deduct credits
    const idempotencyKey = request.headers.get('idempotency-key') || `exec:${plan.rootJobId}:deduct`
    const deduction = await deductCreditsTransaction({
      userId: user.id,
      amount: cost,
      jobId: plan.rootJobId,
      agentId: resolvedAgentId,
      reason: `${agent.name} pipeline execution`,
      idempotencyKey,
    })

    return NextResponse.json({
      plan,
      cost,
      balance: deduction.newBalance,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: error.errors[0].message } },
        { status: 400 }
      )
    }

    if (error instanceof BillingEnforcementError) {
      return NextResponse.json(
        error.toResponseBody(),
        { status: error.statusCode }
      )
    }

    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    return NextResponse.json(
      {
        error: {
          code: 'AGENT_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    )
  }
}
