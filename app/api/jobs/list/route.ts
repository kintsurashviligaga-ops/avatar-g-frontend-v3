/**
 * GET /api/jobs/list
 * List user's jobs with filtering and pagination
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { getRecentJobs } from '@/lib/jobs/jobs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams?.get?.('limit') || '20');
    const jobs = await getRecentJobs({ userId: user.id, limit });

    return NextResponse.json({
      jobs,
      total: jobs.length,
      limit,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHENTICATED') {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        error: {
          code: 'JOBS_LIST_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
