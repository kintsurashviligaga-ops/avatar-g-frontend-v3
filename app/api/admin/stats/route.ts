/**
 * GET /api/admin/stats
 * Admin-only: Returns system health metrics for the admin dashboard.
 * - Active workers, queue depth, dead letter count, throughput.
 * - Requires user role = 'admin' in profiles table.
 * - All queries use service role client.
 */

import { NextResponse } from 'next/server'
import { createRouteHandlerClient, createServiceRoleClient } from '@/lib/supabase/server'
import { structuredLog } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(): Promise<NextResponse> {
  try {
    // Auth: verify current user is admin
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

    // Check admin role in profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Admin access required' } },
        { status: 403 }
      )
    }

    const adminClient = createServiceRoleClient()

    // Worker heartbeats
    const { data: workers } = await adminClient
      .from('worker_heartbeat')
      .select('worker_id, worker_type, status, last_seen_at, current_job_id, jobs_processed, jobs_failed')

    const cutoff = new Date(Date.now() - 60_000).toISOString()
    const aliveWorkers = workers?.filter((w) => w.last_seen_at > cutoff) ?? []
    const deadWorkers = workers?.filter((w) => w.last_seen_at <= cutoff) ?? []

    // Queue depth by status
    const statusCounts: Record<string, number> = {}
    for (const status of ['queued', 'claimed', 'processing', 'failed', 'dead', 'completed'] as const) {
      const { count } = await adminClient
        .from('jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', status)
      statusCounts[status] = count ?? 0
    }

    // Throughput: jobs completed in last 24h
    const oneDayAgo = new Date(Date.now() - 86_400_000).toISOString()
    const { count: throughput24h } = await adminClient
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', oneDayAgo)

    structuredLog('info', 'admin_stats_fetched', { userId: user.id })

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      workers: {
        alive: aliveWorkers.length,
        dead: deadWorkers.length,
        details: workers ?? [],
      },
      queue: {
        queued: statusCounts.queued,
        claimed: statusCounts.claimed,
        processing: statusCounts.processing,
        failed: statusCounts.failed,
        dead: statusCounts.dead,
        completed: statusCounts.completed,
      },
      throughput_24h: throughput24h ?? 0,
    })
  } catch (err) {
    structuredLog('error', 'admin_stats_error', { error: (err as Error).message })
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch admin stats' } },
      { status: 500 }
    )
  }
}
