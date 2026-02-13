import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { simulateScenario } from '@/lib/finance/simulator';
import type { SimulationInput } from '@/lib/finance/simulator';

// Force dynamic rendering
export const dynamic = 'force-dynamic';

const SaveScenarioSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(1),
  inputs: z.object({
    retail_price_cents: z.number().int().positive(),
    supplier_cost_cents: z.number().int().nonnegative(),
    shipping_cost_cents: z.number().int().nonnegative(),
    vat_enabled: z.boolean(),
    vat_rate_bps: z.number().int().optional(),
    platform_fee_bps: z.number().int().optional(),
    affiliate_bps: z.number().int().optional(),
    refund_reserve_bps: z.number().int().optional(),
    expected_orders_per_day: z.number().positive(),
    ad_spend_per_day_cents: z.number().int().nonnegative().optional(),
  }),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    let query = supabase
      .from('simulation_scenarios')
      .select('*')
      .order('created_at', { ascending: false });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data } = await query;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('[GET /api/finance/scenarios]', error);
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = SaveScenarioSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const input = parsed.data;

    // Verify store ownership via RLS
    const { data: store } = await supabase
      .from('stores')
      .select('user_id')
      .eq('id', input.storeId)
      .single();

    if (!store || store.user_id !== user.id) {
      return NextResponse.json({ error: 'Store not found or unauthorized' }, { status: 403 });
    }

    // Simulate scenario
    const outputs = simulateScenario(input.inputs as SimulationInput);

    // Save scenario
    const { data: scenario } = await supabase
      .from('simulation_scenarios')
      .insert({
        store_id: input.storeId,
        name: input.name,
        inputs_json: input.inputs,
        outputs_json: outputs,
      })
      .select()
      .single();

    return NextResponse.json({ data: scenario });
  } catch (error) {
    console.error('[POST /api/finance/scenarios]', error);
    return NextResponse.json({ error: 'Failed to save scenario' }, { status: 500 });
  }
}
