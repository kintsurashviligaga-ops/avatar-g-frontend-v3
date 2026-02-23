import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { WorkflowDefinitionUpdateSchema } from '@/lib/workflows/schemas';
import { getBillingSnapshot } from '@/lib/billing/enforce';
import { validateWorkflowForPlan } from '@/lib/workflows/runner';
import { checkRateLimit, getRateLimitForPlan, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const readLimitError = await checkRateLimit(_request, RATE_LIMITS.READ);
  if (readLimitError) return readLimitError;

  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('workflow_definitions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Workflow not found' }, { status: 404 });
  }

  return NextResponse.json({ workflow: data });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const billing = await getBillingSnapshot(user.id);
  const writeLimitError = await checkRateLimit(request, getRateLimitForPlan(billing.plan, 'write'));
  if (writeLimitError) return writeLimitError;

  const body = await request.json();
  const parsed = WorkflowDefinitionUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.steps) {
      validateWorkflowForPlan(parsed.data.steps, billing.plan);
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.steps !== undefined) updates.steps = parsed.data.steps;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;

    const { data, error } = await supabase
      .from('workflow_definitions')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
    }

    return NextResponse.json({ workflow: data });
  } catch {
    return NextResponse.json({ error: 'Failed to update workflow' }, { status: 500 });
  }
}
