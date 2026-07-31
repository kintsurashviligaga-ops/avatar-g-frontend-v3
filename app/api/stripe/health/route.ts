import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { assertAdminAccess } from '@/lib/admin/guard';

/**
 * GET /api/stripe/health — ADMIN ONLY.
 *
 * ⚠️ THIS WAS PUBLIC, AND ITS DOC COMMENT SAID IT "never exposes secrets" WHILE IT DID.
 *
 * Anyone could GET https://myavatar.ge/api/stripe/health, unauthenticated, and receive the first ten
 * characters of STRIPE_SECRET_KEY, the publishable key and STRIPE_WEBHOOK_SECRET — verified against
 * production, which returned `sk_test_51...`, `pk_test_5...` and `whsec_N2Bv...`. A prefix is not a
 * usable key, but it is free reconnaissance: it confirms the account is real, names the exact
 * integration, and would hand out `sk_live_` / the webhook-secret prefix the moment live keys go in.
 *
 * Two changes: the route is behind the admin gate, and the `secrets` block is gone entirely. Whether a
 * key is SET and whether it is TEST or LIVE is all an operator needs from a health check; the bytes of
 * the key itself are never diagnostic information.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  // Admin only. A 404 rather than a 403 — an unauthorised caller should not learn the route exists.
  const { user } = await authedClientFromRequest(request);
  const gate = assertAdminAccess(request, user);
  if (!gate.ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    // The loudest possible statement of the thing that silently costs the most: a site in test mode
    // takes no real money. Every "top up" succeeds and settles nothing.
    if (mode === 'test') {
      response.warnings.push('TEST MODE — no real payment can be taken. Top-ups will not settle.');
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
