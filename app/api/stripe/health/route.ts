import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/stripe/health
 * 
 * Health check endpoint for Stripe configuration.
 * Returns safe diagnostic info (never exposes secrets).
 * 
 * Useful for:
 * - Verifying Stripe is properly configured in Vercel
 * - Checking required environment variables are set
 * - Monitoring webhook secret configuration
 * - Testing API route availability
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    // Check required environment variables
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripePubKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const appUrl = process.env.APP_URL;

    // Determine mode (test vs live) based on key prefix
    let mode: 'test' | 'live' | 'unknown' = 'unknown';
    if (stripeSecretKey) {
      if (stripeSecretKey.startsWith('sk_test_')) {
        mode = 'test';
      } else if (stripeSecretKey.startsWith('sk_live_')) {
        mode = 'live';
      }
    }

    // Build response
    const response = {
      ok: true,
      timestamp: new Date().toISOString(),
      stripe: {
        mode,
        configured: {
          secretKey: !!stripeSecretKey,
          publishableKey: !!stripePubKey,
          webhookSecret: !!webhookSecret,
        },
        secrets: {
          secretKey: stripeSecretKey ? `${stripeSecretKey.substring(0, 10)}...` : null,
          publishableKey: stripePubKey ? `${stripePubKey.substring(0, 10)}...` : null,
          webhookSecret: webhookSecret ? `${webhookSecret.substring(0, 10)}...` : null,
        },
        appUrl: appUrl || 'not configured (defaults to https://myavatar.ge)',
      },
      checks: {
        stripeSecretKey: stripeSecretKey ? '✓ Set' : '❌ Missing',
        publishableKey: stripePubKey ? '✓ Set' : '❌ Missing',
        webhookSecret: webhookSecret ? '✓ Set' : '❌ Missing',
        appUrl: appUrl ? '✓ Set' : '⚠️ Using default',
      },
      endpoints: {
        createCheckoutSession: '/api/stripe/create-checkout-session',
        webhook: '/api/webhooks/stripe',
        health: '/api/stripe/health',
      },
      pages: {
        pay: '/pay',
        paySuccess: '/pay/success',
        payCancel: '/pay/cancel',
      },
      warnings: [] as string[],
    };

    // Add warnings
    if (!stripeSecretKey) {
      response.warnings.push('STRIPE_SECRET_KEY not configured');
    }
    if (!stripePubKey) {
      response.warnings.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY not configured');
    }
    if (!webhookSecret) {
      response.warnings.push('STRIPE_WEBHOOK_SECRET not configured (webhooks will fail)');
    }
    if (mode === 'unknown') {
      response.warnings.push('Could not determine Stripe mode (test vs live). Check secret key format.');
    }

    const httpStatus = response.warnings.length === 0 ? 200 : 200; // Return 200 even with warnings
    return NextResponse.json(response, { status: httpStatus });
  } catch (error) {
    console.error('[Stripe Health Check] Error:', error);
    return NextResponse.json(
      {
        ok: false,
        error: 'Health check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST/PUT/DELETE not allowed
 */
export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use GET.' },
    { status: 405 }
  );
}
