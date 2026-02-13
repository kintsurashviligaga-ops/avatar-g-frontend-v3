import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { evaluateProductCandidate } from '@/lib/decision-engine/decisionEngine';

export const dynamic = 'force-dynamic';

const EvaluateRequestSchema = z.object({
  productType: z.enum(['standard', 'dropshipping', 'digital']),
  retailPriceCents: z.number().int().positive(),
  supplierCostCents: z.number().int().nonnegative(),
  shippingCostCents: z.number().int().nonnegative(),
  vatEnabled: z.boolean().optional().default(true),
  buyerCountryCode: z.string().optional().default('GE'),
  platformFeeBps: z.number().int().optional().default(500),
  affiliateBps: z.number().int().optional().default(0),
  refundReserveBps: z.number().int().optional().default(200),
  vatRateBps: z.number().int().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = EvaluateRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const input = parsed.data;
    const result = evaluateProductCandidate(input);

    return NextResponse.json({
      data: {
        decision: result.decision,
        reasons: result.reasons,
        warnings: result.warnings,
        computed: result.computed,
        recommendedPriceCents: result.recommendedPriceCents,
      },
    });
  } catch (error) {
    console.error('[POST /api/decision/evaluate]', error);
    return NextResponse.json({ error: 'Failed to evaluate' }, { status: 500 });
  }
}
