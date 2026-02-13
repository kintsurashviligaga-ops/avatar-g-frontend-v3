import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const GetLaunchPlanSchema = z.object({
  storeId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = GetLaunchPlanSchema.safeParse({
      storeId: searchParams.get('storeId'),
    });

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const input = parsed.data;

    // Get latest plan (RLS enforces access)
    const { data: plan } = await supabase
      .from('launch_plans')
      .select('*')
      .eq('store_id', input.storeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!plan) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: plan });
  } catch (error) {
    console.error('[GET /api/launch/plan]', error);
    return NextResponse.json({ error: 'Failed to fetch launch plan' }, { status: 500 });
  }
}
