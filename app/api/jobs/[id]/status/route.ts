/**
 * GET /api/jobs/[id]/status
 * Returns current job status, result, and error info.
 * Used as polling fallback when Supabase Realtime is unavailable.
 *
 * Auth: Required — user can only read own jobs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase/server'
import type { JobStatusResponse } from '@/types/jobs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
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

    const jobId = params.id
    if (!jobId) {
      return NextResponse.json(
        { error: { code: 'INVALID_REQUEST', message: 'jobId is required' } },
        { status: 400 }
      )
    }

    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, status, result, error_message, created_at, updated_at')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !job) {
      return NextResponse.json(
        { error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: job.id,
      status: job.status,
      result: job.result,
      error_message: job.error_message,
      created_at: job.created_at,
      updated_at: job.updated_at,
    } satisfies JobStatusResponse)
  } catch (err) {
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        },
      },
      { status: 500 }
    )
  }
}
