import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const KPIsQuerySchema = z.object({
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
    const parsed = KPIsQuerySchema.safeParse({
      storeId: searchParams.get('storeId'),
    });

    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const input = parsed.data;

    // Verify store ownership via RLS
    const { data: kpis } = await supabase
      .from('growth_kpis')
      .select('*')
      .eq('store_id', input.storeId)
      .order('date', { ascending: false })
      .limit(30);

    // Compute aggregates
    const aggregates = {
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      totalRevenueCents: 0,
    };

    (kpis || []).forEach((kpi: any) => {
      aggregates.totalImpressions += kpi.impressions || 0;
      aggregates.totalClicks += kpi.clicks || 0;
      aggregates.totalConversions += kpi.conversions || 0;
      aggregates.totalRevenueCents += kpi.revenue_cents || 0;
    });

    return NextResponse.json({
      data: {
        kpis: kpis || [],
        aggregates,
      },
    });
  } catch (error) {
    console.error('[GET /api/marketplace/kpis]', error);
    return NextResponse.json({ error: 'Failed to fetch KPIs' }, { status: 500 });
  }
}
