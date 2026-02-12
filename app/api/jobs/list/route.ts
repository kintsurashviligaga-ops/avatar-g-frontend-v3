/**
 * GET /api/jobs/list
 * List user's jobs with filtering and pagination
 */

import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { listJobs } from '@/lib/jobs/jobs';
import type { JobStatus } from '@/lib/jobs/jobs';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Parse query params
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as JobStatus | null;
    const agentId = searchParams.get('agentId');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    // List jobs
    const result = await listJobs({
      userId: user.id,
      status: status || undefined,
      agentId: agentId || undefined,
      limit,
      offset,
    });
    
    return NextResponse.json({
      jobs: result.jobs,
      total: result.total,
      limit,
      offset,
    });
    
  } catch (error) {
    console.error('Jobs list error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to list jobs',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
