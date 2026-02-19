/**
 * POST /api/tools/margin-calculator
 * Calculate product margin with various scenarios
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateMargin, analyzePrice } from '@/lib/finance/margins';

interface MarginCalculatorRequest {
  costCents: number;
  shippingCents?: number;
  paymentFeePct?: number;
  platformFeePct?: number;
  affiliateFeePct?: number;
  isVatPayer: boolean;
  vatRate?: number;
  desiredProfitPct?: number;
  desiredProfitCents?: number;
  analysisMode?: 'calculate' | 'analyze';
  sellingPriceCents?: number; // For analyze mode
  currency?: 'GEL' | 'USD';
  fxRateGelPerUsd?: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: MarginCalculatorRequest = await req.json();

    const {
      costCents,
      shippingCents = 0,
      paymentFeePct = 2.9,
      platformFeePct = 30,
      affiliateFeePct = 0,
      isVatPayer,
      vatRate = 18.0,
      desiredProfitPct,
      desiredProfitCents,
      analysisMode = 'calculate',
      sellingPriceCents,
      currency = 'GEL',
      fxRateGelPerUsd = 2.7,
    } = body;

    // Validate required fields
    if (typeof costCents !== 'number' || costCents < 0) {
      return NextResponse.json(
        { error: 'Invalid costCents' },
        { status: 400 },
      );
    }

    if (typeof isVatPayer !== 'boolean') {
      return NextResponse.json(
        { error: 'Invalid isVatPayer' },
        { status: 400 },
      );
    }

    let result;

    if (analysisMode === 'analyze' && sellingPriceCents !== undefined) {
      // Analyze existing price
      result = analyzePrice({
        sellingPriceCents,
        costCents,
        shippingCents,
        paymentFeePct,
        platformFeePct,
        affiliateFeePct,
        isVatPayer,
        vatRate,
      });
    } else {
      // Calculate recommended price
      result = calculateMargin({
        costCents,
        shippingCents,
        paymentFeePct,
        platformFeePct,
        affiliateFeePct,
        isVatPayer,
        vatRate,
        desiredProfitPct,
        desiredProfitCents,
      });
    }

    // Add currency conversions if applicable
    const response: Record<string, unknown> = {
      ...result,
      currency,
    };

    // If GEL, also show USD equivalent
    if (currency === 'GEL' && fxRateGelPerUsd > 0) {
      response.recommendedPriceUsd = Math.ceil(result.recommendedPriceCents / fxRateGelPerUsd);
      response.fxRate = fxRateGelPerUsd;

      // Convert breakdown to USD
      response.breakdownUsd = {
        revenue: Math.ceil(result.breakdown.revenue / fxRateGelPerUsd),
        vat: Math.ceil(result.breakdown.vat / fxRateGelPerUsd),
        cost: Math.ceil(result.breakdown.cost / fxRateGelPerUsd),
        shipping: Math.ceil(result.breakdown.shipping / fxRateGelPerUsd),
        paymentFee: Math.ceil(result.breakdown.paymentFee / fxRateGelPerUsd),
        platformFee: Math.ceil(result.breakdown.platformFee / fxRateGelPerUsd),
        affiliateFee: Math.ceil(result.breakdown.affiliateFee / fxRateGelPerUsd),
        netProfit: Math.ceil(result.breakdown.netProfit / fxRateGelPerUsd),
      };
    }

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error calculating margin:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to calculate margin',
      },
      { status: 500 },
    );
  }
}
