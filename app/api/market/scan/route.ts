/**
 * Market Scan API Route
 * POST /api/market/scan
 *
 * Scans product niches and returns ranked list of opportunities
 * Each product must pass decision engine before returning
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { evaluateProductCandidate } from '@/lib/decision-engine/decisionEngine';
import { ScannedProduct } from '@/lib/pricing/types';

const MarketScanRequestSchema = z.object({
  niche: z.string().min(2).max(100),
  country: z.string().length(2).default('GE'),
  priceRangeCents: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  competitorUrl: z.string().url().optional(),
});

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = MarketScanRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { niche, country, priceRangeCents, competitorUrl } = parsed.data;

    // Authenticate user
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: _authError } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Mock market scan (in production, would call ML model or API)
    const scannedProducts = await scanMarketNiche(
      niche,
      country,
      priceRangeCents,
      competitorUrl
    );

    // Filter through decision engine: only return approved products
    const evaluatedProducts: ScannedProduct[] = [];

    for (const product of scannedProducts) {
      const decision = evaluateProductCandidate(
        {
          productType: 'standard',
          retailPriceCents: product.currentPriceCents,
          supplierCostCents: product.estimatedCostCents,
          shippingCostCents: 300, // Assume ₾3 average
          vatEnabled: true,
          platformFeeBps: 500,
        },
        { standard: 1500, dropshipping: 2500, digital: 7000 }
      );

      const evaluated: ScannedProduct = {
        ...product,
        profitMarginBps: decision.computed.marginBps,
        decisionEngineApproval: decision.decision === 'publish' ? 'approved' : 'rejected',
        rejectionReason: decision.decision === 'reject' ? decision.reasons[0] : undefined,
        recommendedPriceCents:
          decision.decision === 'reject' ? decision.recommendedPriceCents : undefined,
      };

      evaluatedProducts.push(evaluated);
    }

    // Rank by profitability and demand
    evaluatedProducts.sort((a, b) => {
      // Approved products first
      if (a.decisionEngineApproval !== b.decisionEngineApproval) {
        return a.decisionEngineApproval === 'approved' ? -1 : 1;
      }

      // Then by profit margin
      return b.profitMarginBps - a.profitMarginBps;
    });

    return NextResponse.json({
      data: {
        niche,
        country,
        scanDate: new Date().toISOString(),
        productsScanned: scannedProducts.length,
        productsApproved: evaluatedProducts.filter(
          (p) => p.decisionEngineApproval === 'approved'
        ).length,
        products: evaluatedProducts.slice(0, 20), // Top 20
      },
    });
  } catch (error) {
    console.error('Market scan error:', error);
    return NextResponse.json(
      { error: 'Market scan failed' },
      { status: 500 }
    );
  }
}

/**
 * Mock market scanning (in production: call real market data provider)
 */
async function scanMarketNiche(
  niche: string,
  country: string,
  priceRange: [number, number],
  _competitorUrl?: string
): Promise<ScannedProduct[]> {
  // Mock products for Demo & Testing
  const mockProducts: ScannedProduct[] = [
    {
      id: 'prod_1',
      name: `${niche} Premium Bundle`,
      currentPriceCents: 8000,
      estimatedCostCents: 2000,
      profitMarginBps: 6000,
      estimatedDemand: 'high',
      riskScore: 15,
      decisionEngineApproval: 'approved',
    },
    {
      id: 'prod_2',
      name: `${niche} Standard Pack`,
      currentPriceCents: 5000,
      estimatedCostCents: 2500,
      profitMarginBps: 2500,
      estimatedDemand: 'medium',
      riskScore: 30,
      decisionEngineApproval: 'approved',
    },
    {
      id: 'prod_3',
      name: `${niche} Economy Option`,
      currentPriceCents: 3000,
      estimatedCostCents: 2800,
      profitMarginBps: 200,
      estimatedDemand: 'low',
      riskScore: 85,
      decisionEngineApproval: 'rejected',
      rejectionReason: 'Margin 7% below 15% standard minimum',
      recommendedPriceCents: 3500,
    },
    {
      id: 'prod_4',
      name: `${niche} Deluxe Edition`,
      currentPriceCents: 12000,
      estimatedCostCents: 3000,
      profitMarginBps: 9000,
      estimatedDemand: 'high',
      riskScore: 10,
      decisionEngineApproval: 'approved',
    },
  ];

  // Filter by price range
  return mockProducts.filter(
    (p) => p.currentPriceCents >= priceRange[0] && p.currentPriceCents <= priceRange[1]
  );
}
