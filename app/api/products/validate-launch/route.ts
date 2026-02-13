import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateProductLaunch } from '@/lib/optimization/profitFirst';
import { z } from 'zod';

// ========================================
// PRODUCT LAUNCH VALIDATION API
// Blocks unprofitable products from launching
// ========================================

const ProductLaunchSchema = z.object({
  productCostCents: z.number().int().positive(),
  sellingPriceCents: z.number().int().positive(),
  shippingCostCents: z.number().int().nonnegative(),
  storeId: z.string().uuid(),
});

/**
 * POST /api/products/validate-launch
 * 
 * Validates if a product can launch based on profit guardrails
 * Returns blocking verdict if margin < 20%
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();

    // Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized', code: 'AUTH_REQUIRED' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const validation = ProductLaunchSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validation.error.errors },
        { status: 400 }
      );
    }

    const { productCostCents, sellingPriceCents, shippingCostCents, storeId } = validation.data;

    // Verify store ownership
    const { data: store, error: storeError } = await supabase
      .from('stores')
      .select('id, owner_id')
      .eq('id', storeId)
      .single();

    if (storeError || !store) {
      return NextResponse.json({ error: 'Store not found', code: 'STORE_NOT_FOUND' }, { status: 404 });
    }

    if (store.owner_id !== user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to manage this store', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // VALIDATE PRODUCT LAUNCH
    const validationResult = await validateProductLaunch({
      productCostCents,
      sellingPriceCents,
      shippingCostCents,
      storeId,
      supabaseClient: supabase,
    });

    // Return validation result
    return NextResponse.json(
      {
        success: true,
        validation: {
          canLaunch: validationResult.canLaunch,
          blocked: validationResult.blocked,
          issues: validationResult.issues,
          recommendations: validationResult.recommendations,
          marginAnalysis: {
            currentMarginBps: validationResult.marginAnalysis.currentMarginBps,
            currentMarginPercent: (validationResult.marginAnalysis.currentMarginBps / 100).toFixed(2),
            netMarginAfterFeesBps: validationResult.marginAnalysis.netMarginAfterFeesBps,
            netMarginPercent: (validationResult.marginAnalysis.netMarginAfterFeesBps / 100).toFixed(2),
            minimumRequiredBps: validationResult.marginAnalysis.minimumRequiredMarginBps,
            minimumRequiredPercent: (validationResult.marginAnalysis.minimumRequiredMarginBps / 100).toFixed(2),
            marginBuffer: validationResult.marginAnalysis.marginBuffer,
            status: validationResult.marginAnalysis.status,
          },
          worstCaseSimulation: {
            effectiveMarginBps: validationResult.worstCaseSimulation.effectiveMarginBps,
            effectiveMarginPercent: (validationResult.worstCaseSimulation.effectiveMarginBps / 100).toFixed(2),
            breakEvenProbability: (validationResult.worstCaseSimulation.breakEvenProbability * 100).toFixed(1),
            recommendation: validationResult.worstCaseSimulation.recommendation,
            assumptions: {
              conversionRate: `${(validationResult.worstCaseSimulation.lowConversionRateBps / 100).toFixed(1)}%`,
              maxCac: `₾${(validationResult.worstCaseSimulation.highCacCents / 100).toFixed(2)}`,
              refundRate: `${(validationResult.worstCaseSimulation.refundRateBps / 100).toFixed(1)}%`,
              shippingOverrun: `${(validationResult.worstCaseSimulation.shippingOverrunBps / 100).toFixed(1)}%`,
            },
          },
        },
      },
      { status: validationResult.canLaunch ? 200 : 422 } // 422 Unprocessable Entity if blocked
    );
  } catch (error) {
    console.error('Error validating product launch:', error);
    return NextResponse.json(
      { error: 'Internal server error', code: 'VALIDATION_ERROR' },
      { status: 500 }
    );
  }
}

/**
 * Example request body:
 * 
 * {
 *   "productCostCents": 3000,
 *   "sellingPriceCents": 5000,
 *   "shippingCostCents": 500,
 *   "storeId": "9b3a5c8d-1234-5678-90ab-cdef12345678"
 * }
 * 
 * Example response (BLOCKED):
 * 
 * {
 *   "success": true,
 *   "validation": {
 *     "canLaunch": false,
 *     "blocked": true,
 *     "issues": [
 *       {
 *         "severity": "critical",
 *         "field": "margin",
 *         "message": "Net margin 18.5% is below the mandatory 20% floor. This product CANNOT launch.",
 *         "blockingIssue": true
 *       }
 *     ],
 *     "recommendations": [
 *       {
 *         "recommendedPriceCents": 5800,
 *         "expectedMarginBps": 3000,
 *         "rationale": "Increase price to ₾58.00 to achieve a safe 30% net margin with buffer against cost fluctuations.",
 *         "confidence": "high"
 *       }
 *     ],
 *     "marginAnalysis": {
 *       "currentMarginBps": 3000,
 *       "currentMarginPercent": "30.00",
 *       "netMarginAfterFeesBps": 1850,
 *       "netMarginPercent": "18.50",
 *       "minimumRequiredBps": 2000,
 *       "minimumRequiredPercent": "20.00",
 *       "marginBuffer": -150,
 *       "status": "unsafe"
 *     },
 *     "worstCaseSimulation": {
 *       "effectiveMarginBps": 850,
 *       "effectiveMarginPercent": "8.50",
 *       "breakEvenProbability": "25.0",
 *       "recommendation": "block",
 *       "assumptions": {
 *         "conversionRate": "2.0%",
 *         "maxCac": "₾10.00",
 *         "refundRate": "5.0%",
 *         "shippingOverrun": "10.0%"
 *       }
 *     }
 *   }
 * }
 * 
 * Example response (APPROVED):
 * 
 * {
 *   "success": true,
 *   "validation": {
 *     "canLaunch": true,
 *     "blocked": false,
 *     "issues": [],
 *     "recommendations": [],
 *     "marginAnalysis": {
 *       "currentMarginBps": 4200,
 *       "currentMarginPercent": "42.00",
 *       "netMarginAfterFeesBps": 3300,
 *       "netMarginPercent": "33.00",
 *       "minimumRequiredBps": 2000,
 *       "minimumRequiredPercent": "20.00",
 *       "marginBuffer": 1300,
 *       "status": "safe"
 *     },
 *     "worstCaseSimulation": {
 *       "effectiveMarginBps": 2100,
 *       "effectiveMarginPercent": "21.00",
 *       "breakEvenProbability": "95.0",
 *       "recommendation": "launch",
 *       "assumptions": {
 *         "conversionRate": "2.0%",
 *         "maxCac": "₾10.00",
 *         "refundRate": "5.0%",
 *         "shippingOverrun": "10.0%"
 *       }
 *     }
 *   }
 * }
 */
