import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { WorkflowDefinitionCreateSchema } from '@/lib/workflows/schemas';
import { getBillingSnapshot } from '@/lib/billing/enforce';
import { validateWorkflowForPlan } from '@/lib/workflows/runner';
import { checkRateLimit, getRateLimitForPlan, RATE_LIMITS } from '@/lib/api/rate-limit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestRateLimit = await checkRateLimit(request, RATE_LIMITS.READ);
  if (requestRateLimit) return requestRateLimit;

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
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: 'Failed to load workflows' }, { status: 500 });
  }

  return NextResponse.json({ workflows: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const billing = await getBillingSnapshot(user.id);
  const rateLimitError = await checkRateLimit(request, getRateLimitForPlan(billing.plan, 'write'));
  if (rateLimitError) {
    return rateLimitError;
  }

  const body = await request.json();
  const parsed = WorkflowDefinitionCreateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    validateWorkflowForPlan(parsed.data.steps, billing.plan);

    const { data, error } = await supabase
      .from('workflow_definitions')
      .insert({
        user_id: user.id,
        name: parsed.data.name,
        steps: parsed.data.steps,
        status: parsed.data.status,
        current_step: null,
        result: null,
        logs: [],
      })
      .select('*')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Failed to save workflow' }, { status: 500 });
    }

    return NextResponse.json({ workflow: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create workflow' }, { status: 500 });
  }
}
