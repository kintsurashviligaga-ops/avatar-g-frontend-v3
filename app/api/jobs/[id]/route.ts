import { NextRequest, NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/supabase/auth';
import { getJob, updateJob, type JobStatus } from '@/lib/jobs/jobs';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const job = await getJob({ userId: user.id, id: params.id });

    if (!job) {
      return NextResponse.json(
        { error: { code: 'JOB_NOT_FOUND', message: 'Job not found' } },
        { status: 404 }
      );
    }

    return NextResponse.json({ job });
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
          code: 'JOB_FETCH_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuthenticatedUser(request);
    const body = await request.json() as {
      status?: JobStatus;
      outputJson?: Record<string, unknown>;
      error?: string | null;
    };

    const updated = await updateJob({
      userId: user.id,
      id: params.id,
      status: body.status,
      outputJson: body.outputJson,
      error: body.error,
    });

    return NextResponse.json({ job: updated });
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
          code: 'JOB_UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
