import { NextRequest, NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/stripe/client';

/**
 * POST /api/stripe/create-checkout-session
 * 
 * Create a Stripe Checkout Session for a one-time payment.
 * This is a simpler endpoint for testing payments without order data.
 * 
 * Request body: {
 *   amount?: number (cents, default 10000 = $100.00 for testing),
 *   currency?: string (default "usd"),
 *   customerEmail?: string (optional),
 *   description?: string (optional, default "Avatar G - Test Payment")
 * }
 * 
 * Response: { url: string (checkout session URL), id: string (session ID) }
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Required for Stripe

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json().catch(() => ({}));
    
    const {
      amount = 10000, // Default: $100.00 USD (for test)
      currency = 'usd',
      customerEmail = '',
      description = 'Avatar G - Test Payment',
    } = body;

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Invalid amount. Must be positive number (cents).' },
        { status: 400 }
      );
    }

    // Get Stripe client
    const stripe = getStripeClient();

    // Get APP_URL for success/cancel URLs
    const appUrl = process.env.APP_URL || 'https://myavatar.ge';

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: description,
              description: 'One-time payment for Avatar G services',
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment', // One-time payment
      success_url: `${appUrl}/pay/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pay/cancel`,
      customer_email: customerEmail || undefined,
      metadata: {
        source: 'avatar-g-test-payment',
        timestamp: new Date().toISOString(),
      },
    });

    if (!session.url) {
      console.error('Failed to create session URL');
      return NextResponse.json(
        { error: 'Failed to create checkout session' },
        { status: 500 }
      );
    }

    console.log(`[Stripe] Checkout session created`, {
      sessionId: session.id,
      amount,
      currency,
      url: session.url,
    });

    return NextResponse.json({
      url: session.url,
      id: session.id,
      amount,
      currency,
    });
  } catch (error) {
    console.error('[Stripe] Checkout session creation failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET endpoint returns method not allowed
 */
export async function GET(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST.' },
    { status: 405 }
  );
}
