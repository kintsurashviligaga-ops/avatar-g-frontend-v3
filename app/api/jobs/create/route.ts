/**
 * POST /api/jobs/create
 * Create a new job through Agent G execution router.
 *
 * Auth: Required (Bearer token or cookie session)
 * Body: { agent_id, payload, idempotency_key?, priority? }
 *
 * Idempotency: If idempotency_key matches an active job (queued/claimed/processing/completed),
 * returns the existing job instead of creating a new one.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { structuredLog } from '@/lib/logger'
import type { CreateJobRequest, CreateJobResponse } from '@/types/jobs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 10

const ROUTE_TIMEOUT_MS = 9000

export async function POST(request: NextRequest): Promise<Response> {
  return Promise.race([
    handleCreateJob(request),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Route timeout')), ROUTE_TIMEOUT_MS)
    ),
  ]).catch((err) => {
    structuredLog('error', 'route_timeout', { error: (err as Error).message, route: '/api/jobs/create' })
    return NextResponse.json({ error: 'Request timeout' }, { status: 504 })
  })
}

async function handleCreateJob(request: NextRequest): Promise<NextResponse> {
  try {
    // Auth
    const supabase = createRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      )
    }

    // Parse body
    const body: CreateJobRequest = await request.json()

    if (!body.agent_id || typeof body.agent_id !== 'string') {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'agent_id is required' } },
        { status: 400 }
      )
    }

    const agentId = body.agent_id
    const payload = body.payload ?? {}
    const idempotencyKey = body.idempotency_key ?? null
    const priority = Math.min(10, Math.max(1, body.priority ?? 5))

    const serviceClient = createServiceRoleClient()

    // Validate agent exists and is active
    const { data: agentDef } = await serviceClient
      .from('agent_definitions')
      .select('id, active, timeout_seconds, max_attempts')
      .eq('id', agentId)
      .single()

    if (!agentDef) {
      return NextResponse.json(
        { error: { code: 'AGENT_NOT_FOUND', message: `Unknown agent: ${agentId}` } },
        { status: 404 }
      )
    }

    if (!agentDef.active) {
      return NextResponse.json(
        { error: { code: 'AGENT_DISABLED', message: `Agent ${agentId} is currently disabled` } },
        { status: 403 }
      )
    }

    // Idempotency check
    if (idempotencyKey) {
      const { data: existing } = await serviceClient
        .from('jobs')
        .select('id, status')
        .eq('idempotency_key', idempotencyKey)
        .eq('user_id', user.id)
        .not('status', 'in', '("failed","dead")')
        .maybeSingle()

      if (existing) {
        structuredLog('info', 'idempotent_job_hit', { jobId: existing.id, status: existing.status })
        return NextResponse.json({
          jobId: existing.id,
          status: existing.status,
          idempotent: true,
        } satisfies CreateJobResponse & { idempotent: boolean })
      }
    }

    // Create job
    const { data: job, error: insertError } = await serviceClient
      .from('jobs')
      .insert({
        user_id: user.id,
        agent_id: agentId,
        status: 'queued',
        priority,
        payload,
        idempotency_key: idempotencyKey,
        timeout_seconds: agentDef.timeout_seconds ?? 300,
        max_attempts: agentDef.max_attempts ?? 3,
        attempt_count: 0,
      })
      .select('id, status')
      .single()

    if (insertError || !job) {
      structuredLog('error', 'job_insert_failed', { error: insertError?.message, agentId })
      return NextResponse.json(
        { error: { code: 'JOB_CREATE_FAILED', message: 'Failed to create job' } },
        { status: 500 }
      )
    }

    structuredLog('info', 'job_created', { jobId: job.id, agentId, userId: user.id })

    return NextResponse.json({
      jobId: job.id,
      status: job.status as CreateJobResponse['status'],
    } satisfies CreateJobResponse)
  } catch (err) {
    structuredLog('error', 'job_create_error', { error: (err as Error).message })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    )
  }
}
