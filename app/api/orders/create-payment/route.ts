/**
 * Example: Create Order with Platform Fee
 * 
 * POST /api/orders/create-payment
 * 
 * Demonstrates how to integrate Stripe Connect payments
 * into your order creation flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { createPaymentWithFee } from '@/lib/stripe/payments';
import { canSellerReceivePayments } from '@/lib/stripe/connect';

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
    const { orderId, sellerId, amountCents, productName, metadata } = body;

    // Validate inputs
    if (!orderId || !sellerId || !amountCents) {
      return NextResponse.json(
        { error: 'Missing required fields: orderId, sellerId, amountCents' },
        { status: 400 }
      );
    }

    if (amountCents < 50) {
      return NextResponse.json(
        { error: 'Amount must be at least $0.50' },
        { status: 400 }
      );
    }

    // 3. Verify seller can receive payments
    const canReceive = await canSellerReceivePayments(sellerId);
    if (!canReceive) {
      return NextResponse.json(
        {
          error:
            'Seller is not eligible to receive payments. Please complete onboarding.',
          code: 'SELLER_NOT_ELIGIBLE',
        },
        { status: 400 }
      );
    }

    // 4. Create order in database (example)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        user_id: user.id,
        seller_id: sellerId,
        subtotal_amount: (amountCents / 100).toFixed(2),
        total_amount: (amountCents / 100).toFixed(2),
        status: 'pending',
        metadata_json: {
          product_name: productName,
          ...metadata,
        },
      })
      .select()
      .single();

    if (orderError) {
      console.error('[Order] Failed to create:', orderError);
      return NextResponse.json(
        { error: 'Failed to create order' },
        { status: 500 }
      );
    }

    // 5. Create payment intent with platform fee
    const paymentResult = await createPaymentWithFee({
      amountCents,
      currency: 'usd',
      sellerId,
      orderId,
      description: `Order ${orderId} - ${productName || 'Purchase'}`,
      metadata: {
        order_id: orderId,
        customer_id: user.id,
        product: productName || 'unknown',
        ...metadata,
      },
    });

    // 6. Update order with payment intent ID
    await supabase
      .from('orders')
      .update({
        stripe_payment_intent_id: paymentResult.paymentIntent.id,
      })
      .eq('id', orderId);

    console.info('[Order] Payment created:', {
      orderId,
      paymentIntentId: paymentResult.paymentIntent.id,
      total: amountCents,
      platformFee: paymentResult.applicationFeeCents,
      sellerPayout: paymentResult.sellerPayoutCents,
    });

    // 7. Return client secret for Stripe Elements
    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        status: order.status,
        total: amountCents,
      },
      payment: {
        clientSecret: paymentResult.clientSecret,
        paymentIntentId: paymentResult.paymentIntent.id,
      },
      breakdown: {
        total: amountCents,
        platformFee: paymentResult.applicationFeeCents,
        sellerPayout: paymentResult.sellerPayoutCents,
        commissionRate: paymentResult.effectiveCommissionRate,
      },
    });
  } catch (error) {
    console.error('[Order] Error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to create payment',
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
