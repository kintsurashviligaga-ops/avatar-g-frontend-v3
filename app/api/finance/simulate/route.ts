import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { simulateScenario } from '@/lib/finance/simulator';

export const dynamic = 'force-dynamic';

const SimulateRequestSchema = z.object({
  currency: z.enum(['GEL', 'USD']).optional().default('GEL'),
  fxRate: z.number().positive().optional(),
  buyerCountryCode: z.string().optional().default('GE'),
  vatEnabled: z.boolean().optional().default(true),
  vatRateBps: z.number().int().optional().default(1800),
  pricesIncludeVat: z.boolean().optional().default(true),
  retailPriceCents: z.number().int().positive(),
  supplierCostCents: z.number().int().nonnegative(),
  shippingCostCents: z.number().int().nonnegative(),
  platformFeeBps: z.number().int().optional().default(500),
  affiliateBps: z.number().int().optional().default(0),
  refundReserveBps: z.number().int().optional().default(200),
  expectedOrdersPerDay: z.number().positive(),
  adSpendPerDayCents: z.number().int().nonnegative().optional().default(0),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = SimulateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const input = parsed.data;
    const output = simulateScenario({
      retail_price_cents: input.retailPriceCents,
      supplier_cost_cents: input.supplierCostCents,
      shipping_cost_cents: input.shippingCostCents,
      vat_enabled: input.vatEnabled,
      vat_rate_bps: input.vatRateBps,
      platform_fee_bps: input.platformFeeBps,
      affiliate_bps: input.affiliateBps,
      refund_reserve_bps: input.refundReserveBps,
      expected_orders_per_day: input.expectedOrdersPerDay,
      ad_spend_per_day_cents: input.adSpendPerDayCents,
    });

    const warnings: string[] = [];
    if (input.currency !== 'GEL' && !input.fxRate) {
      warnings.push('No FX rate provided for currency conversion');
    }

    return NextResponse.json({
      data: {
        vatAmountCents: 0, // Will be computed by simulator
        platformFeeCents: 0,
        affiliateFeeCents: 0,
        refundReserveCents: 0,
        netPerOrderCents: output.net_per_order_cents,
        marginBps: Math.round((output.margin_percent / 100) * 10000),
        dailyProfitCents: output.daily_profit_cents,
        weeklyProfitCents: output.daily_profit_cents * 7,
        monthlyProfitCents: output.monthly_profit_cents,
        breakEvenOrdersPerDay: output.break_even_orders,
        warnings,
      },
    });
  } catch (error) {
    console.error('[POST /api/finance/simulate]', error);
    return NextResponse.json({ error: 'Failed to simulate' }, { status: 500 });
  }
}
