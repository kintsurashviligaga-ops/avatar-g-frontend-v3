/**
 * Stripe Connect - Account Status Endpoint
 * 
 * GET /api/stripe/connect/account-status
 * Returns seller's Connect account status and capabilities
 * 
 * Security:
 * - Requires authenticated user
 * - Returns only user's own account data
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import {
  getSellerAccount,
  getAccountStatus,
  updateAccountStatus,
  createLoginLink,
} from '@/lib/stripe/connect';

export async function GET(_request: NextRequest) {
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

    // 2. Get seller's account from database
    const account = await getSellerAccount(user.id);

    if (!account || !account.stripe_account_id) {
      return NextResponse.json({
        hasAccount: false,
        account: null,
        canReceivePayments: false,
        message: 'No Connect account found. Please complete onboarding.',
      });
    }

    // 3. Fetch latest status from Stripe
    const { account: stripeAccount, canReceivePayments, requirementsStatus } =
      await getAccountStatus(account.stripe_account_id);

    // 4. Update database with latest status
    await updateAccountStatus(user.id, account.stripe_account_id);

    // 5. Generate login link for seller dashboard (if eligible)
    let dashboardUrl: string | null = null;
    if (account.details_submitted) {
      try {
        dashboardUrl = await createLoginLink(account.stripe_account_id);
      } catch (error) {
        console.warn('[Account Status] Could not create login link:', error);
      }
    }

    // 6. Return comprehensive status
    return NextResponse.json({
      hasAccount: true,
      canReceivePayments,
      account: {
        id: account.stripe_account_id,
        status: account.status,
        chargesEnabled: stripeAccount.charges_enabled ?? false,
        payoutsEnabled: stripeAccount.payouts_enabled ?? false,
        detailsSubmitted: stripeAccount.details_submitted ?? false,
        email: stripeAccount.email,
        country: stripeAccount.country,
        currency: stripeAccount.default_currency,
        onboardingCompletedAt: account.onboarding_completed_at,
      },
      requirements: {
        currentlyDue: requirementsStatus.currentlyDue,
        eventuallyDue: requirementsStatus.eventuallyDue,
        pastDue: requirementsStatus.pastDue,
        disabled: requirementsStatus.disabled,
        disabledReason: stripeAccount.requirements?.disabled_reason ?? null,
      },
      capabilities: {
        cardPayments: stripeAccount.capabilities?.card_payments ?? 'inactive',
        transfers: stripeAccount.capabilities?.transfers ?? 'inactive',
      },
      dashboardUrl,
    });
  } catch (error) {
    console.error('[Account Status] Error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to fetch account status',
      },
      { status: 500 }
    );
  }
}

/**
 * POST method not allowed
 */
export async function POST() {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET.' },
    { status: 405 }
  );
}
