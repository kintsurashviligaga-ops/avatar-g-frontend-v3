import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const GenerateLaunchPlanSchema = z.object({
  storeId: z.string().uuid(),
  language: z.enum(['ka', 'en', 'ru']).optional().default('en'),
  niche: z.string().optional(),
  goalMonthlyRevenueCents: z.number().int().optional(),
  budgetCents: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = GenerateLaunchPlanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const input = parsed.data;

    // Verify store ownership
    const { data: store } = await supabase
      .from('stores')
      .select('user_id')
      .eq('id', input.storeId)
      .single();

    if (!store || store.user_id !== user.id) {
      return NextResponse.json({ error: 'Store not found or unauthorized' }, { status: 403 });
    }

    // Generate 12-week launch plan
    const plan = {
      weeks: generateWeeklyPlan(),
      checklist: generateChecklist(),
      socialTemplates: generateSocialTemplates(input.language),
      influencerScripts: generateInfluencerScripts(input.language),
    };

    // Save to launch_plans table
    const { data: savedPlan } = await supabase
      .from('launch_plans')
      .insert({
        store_id: input.storeId,
        plan_json: plan,
        language: input.language,
      })
      .select()
      .single();

    return NextResponse.json({
      data: {
        planId: savedPlan?.id,
        plan,
      },
    });
  } catch (error) {
    console.error('[POST /api/launch/generate]', error);
    return NextResponse.json({ error: 'Failed to generate launch plan' }, { status: 500 });
  }
}

function generateWeeklyPlan() {
  return Array.from({ length: 12 }, (_, i) => ({
    week: i + 1,
    title: `Week ${i + 1}`,
    tasks: [
      'Prepare content',
      'Engage community',
      'Analyze metrics',
    ],
  }));
}

function generateChecklist() {
  return [
    { item: 'Set up store branding', completed: false },
    { item: 'Create product listings', completed: false },
    { item: 'Set up payment processing', completed: false },
    { item: 'Launch social media campaign', completed: false },
    { item: 'Reach first sale', completed: false },
  ];
}

function generateSocialTemplates(language: string) {
  if (language === 'ka') {
    return ['Template 1 (Georgian)', 'Template 2 (Georgian)'];
  }
  if (language === 'ru') {
    return ['Template 1 (Russian)', 'Template 2 (Russian)'];
  }
  return ['Template 1 (English)', 'Template 2 (English)'];
}

function generateInfluencerScripts(language: string) {
  if (language === 'ka') {
    return ['Script 1 (Georgian)', 'Script 2 (Georgian)'];
  }
  if (language === 'ru') {
    return ['Script 1 (Russian)', 'Script 2 (Russian)'];
  }
  return ['Script 1 (English)', 'Script 2 (English)'];
}
