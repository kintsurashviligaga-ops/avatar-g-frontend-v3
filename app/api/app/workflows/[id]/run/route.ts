import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { WorkflowRunStartSchema } from '@/lib/workflows/schemas';
import { startWorkflowRun } from '@/lib/workflows/runner';
import { getBillingSnapshot } from '@/lib/billing/enforce';
import { checkRateLimit, getRateLimitForPlan } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const billing = await getBillingSnapshot(user.id);
  const rateLimitError = await checkRateLimit(request, getRateLimitForPlan(billing.plan, 'expensive'));
  if (rateLimitError) return rateLimitError;

  const body = await request.json();
  const parsed = WorkflowRunStartSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const run = await startWorkflowRun({
      userId: user.id,
      workflowId: params.id,
      triggerInput: parsed.data.triggerInput,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    return NextResponse.json({ run });
  } catch {
    return NextResponse.json({ error: 'Failed to start workflow run' }, { status: 500 });
  }
}
