import { NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import type { ExecutiveTaskLog } from '@/types/billing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/executive/tasks
 * Returns the authenticated user's executive task history (last 50).
 */
export async function GET() {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const admin = createServiceRoleClient();

    const { data, error } = await admin
      .from('executive_task_logs')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      structuredLog('error', 'executive.tasks.list_fail', {
        userId: user.id,
        error: error.message,
      });
      return NextResponse.json({ error: 'fetch_failed' }, { status: 500 });
    }

    return NextResponse.json({ tasks: (data ?? []) as ExecutiveTaskLog[] });
  } catch (err) {
    structuredLog('error', 'executive.tasks.error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
