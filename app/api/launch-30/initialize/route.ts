import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateLaunch30Plan } from '@/lib/gtm/launch30';

// ========================================
// POST /api/launch-30/initialize  
// ========================================
// Generate a new 30-day launch plan for store

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Get user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const { storeId, language = 'en', goal = 'hybrid' } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'Missing storeId' }, { status: 400 });
    }

    // Verify store ownership
    const { data: store } = await supabase
      .from('shops')
      .select('id, owner_id')
      .eq('id', storeId)
      .single();

    if (!store || store.owner_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Generate plan
    const plan = generateLaunch30Plan({
      storeId,
      language: language as 'en' | 'ka' | 'ru',
      goal: goal as 'volume' | 'profit' | 'hybrid',
    });

    // Save to database
    const { data: savedPlan, error: saveError } = await supabase
      .from('launch_30_plans')
      .upsert([
        {
          store_id: storeId,
          language,
          plan_json: plan,
        },
      ])
      .select()
      .single();

    if (saveError) {
      console.error('Error saving plan:', saveError);
      return NextResponse.json({ error: 'Failed to save plan' }, { status: 500 });
    }

    return NextResponse.json({ plan: savedPlan.plan_json }, { status: 201 });
  } catch (error) {
    console.error('POST /api/launch-30/initialize error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
