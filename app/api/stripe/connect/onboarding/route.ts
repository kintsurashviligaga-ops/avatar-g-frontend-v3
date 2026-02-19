/**
 * Stripe Connect - Onboarding Endpoint
 * 
 * POST /api/stripe/connect/onboarding
 * Creates Connect account and returns onboarding URL
 * 
 * Security:
 * - Requires authenticated user
 * - Creates Standard account (seller owns account)
 * - Platform never has access to seller's API keys
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { createConnectAccount } from '@/lib/stripe/connect';

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = createRouteHandlerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse request body
    const body = await request.json();
    const { businessName } = body;

    // 3. Get user email
    const email = user.email;
    if (!email) {
      return NextResponse.json(
        { error: 'User email not found' },
        { status: 400 }
      );
    }

    // 4. Check if user has seller profile
    const { data: sellerProfile, error: profileError } = await supabase
      .from('seller_profiles')
      .select('id, user_id')
      .eq('user_id', user.id)
      .single();

    if (profileError || !sellerProfile) {
      // Create seller profile if doesn't exist
      const { error: createError } = await supabase
        .from('seller_profiles')
        .insert({
          user_id: user.id,
          tax_status: 'non_vat_payer', // Default, can be updated
          business_type: 'own_product', // Default
          target_monthly_income_cents: 10000, // $100
          available_budget_cents: 5000, // $50
        });

      if (createError) {
        console.error('[Onboarding] Failed to create seller profile:', createError);
        return NextResponse.json(
          { error: 'Failed to create seller profile' },
          { status: 500 }
        );
      }
    }

    // 5. Create Connect account and get onboarding URL
    const { accountId, onboardingUrl } = await createConnectAccount(
      user.id,
      email,
      businessName
    );

    console.log('[Onboarding] Created account:', {
      userId: user.id,
      accountId,
    });

    // 6. Return onboarding URL
    return NextResponse.json({
      success: true,
      accountId,
      onboardingUrl,
      message: 'Connect account created successfully',
    });
  } catch (error) {
    console.error('[Onboarding] Error:', error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create Connect account',
      },
      { status: 500 }
    );
  }
}

/**
 * GET method not allowed
 */
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
