import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { reconcileWorkflowRun } from '@/lib/workflows/runner';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const rateLimitError = await checkRateLimit(_request, RATE_LIMITS.WRITE);
  if (rateLimitError) return rateLimitError;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const state = await reconcileWorkflowRun({ userId: user.id, runId: params.id });
    return NextResponse.json(state);
  } catch {
    return NextResponse.json({ error: 'Failed to tick workflow run' }, { status: 500 });
  }
}
