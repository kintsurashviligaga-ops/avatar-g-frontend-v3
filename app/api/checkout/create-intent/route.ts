import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createPaymentIntent } from '@/lib/stripe/client';
import { CreatePaymentIntentInputSchema } from '@/lib/stripe/types';
import { computeOrderTotals } from '@/lib/finance/orderCalculation';
import { createTaxProfileFromStore } from '@/lib/finance/taxProfile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Stripe requires nodejs runtime

// ========================================
// POST /api/checkout/create-intent
// ========================================
// Create a Stripe PaymentIntent for an order
// Auth required, order must exist and be unpaid

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and validate input
    const body = await request.json().catch(() => ({}));
    const inputResult = CreatePaymentIntentInputSchema.safeParse(body);

    if (!inputResult.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: inputResult.error.issues },
        { status: 400 }
      );
    }

    const { orderId } = inputResult.data;

    // 3. Load order and verify ownership (via store)
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // 4. Verify store belongs to user
    const { data: store, error: storeError } = await supabase
      .from('shops')
      .select('*')
      .eq('id', order.store_id)
      .single();

    if (storeError || !store || store.owner_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // 5. Check order isn't already paid
    if (order.status === 'paid' || order.status === 'completed') {
      return NextResponse.json({ error: 'Order already paid' }, { status: 400 });
    }

    // 6. Server-side total verification
    // Reconstruct order totals using finance engine
    const storeProfile = await createTaxProfileFromStore(store);
    const buyerCountryCode = order.buyer_country || 'GE';

    // Get order items to recompute subtotal
    const { data: lineItems } = await supabase
      .from('order_line_items')
      .select('*')
      .eq('order_id', orderId);

    let subtotalCents = 0;
    if (lineItems) {
      subtotalCents = lineItems.reduce((sum, item) => sum + (item.unit_price_cents * item.quantity), 0);
    }

    const calculatedTotals = computeOrderTotals({
      subtotalCents,
      shippingCostCents: order.shipping_cost_cents || 0,
      platformFeeBps: 500, // 5% default
      affiliateFeeBps: 0,
      buyerCountryCode,
      taxProfile: storeProfile,
    });

    // Verify client didn't manipulate totals
    const serverTotalCents = calculatedTotals.totalCents;
    const clientTotalCents = order.total_cents;

    if (serverTotalCents !== clientTotalCents) {
      console.warn(
        `Total mismatch for order ${orderId}: client=${clientTotalCents}, server=${serverTotalCents}`
      );
      return NextResponse.json(
        {
          error: 'Order total mismatch',
          details: 'Server-side verification failed',
        },
        { status: 400 }
      );
    }

    // 7. Create Stripe PaymentIntent
    const paymentResult = await createPaymentIntent({
      amountCents: serverTotalCents,
      currency: order.currency || 'GEL',
      orderId,
      storeId: store.id,
      userId: user.id,
      email: order.buyer_email,
      metadata: {
        storeId: store.id,
        orderId,
        taxStatus: storeProfile.tax_status,
      },
    });

    // 8. Record payment attempt
    const { error: paymentAttemptError } = await supabase
      .from('payment_attempts')
      .insert([
        {
          order_id: orderId,
          user_id: user.id,
          store_id: store.id,
          provider: 'stripe',
          payment_intent_id: paymentResult.paymentIntentId,
          status: 'created',
          amount_total_cents: serverTotalCents,
          currency: order.currency || 'GEL',
          created_at: new Date().toISOString(),
        },
      ]);

    if (paymentAttemptError) {
      console.error('Error recording payment attempt:', paymentAttemptError);
      return NextResponse.json(
        { error: 'Failed to record payment' },
        { status: 500 }
      );
    }

    // 9. Return clientSecret to client
    return NextResponse.json(
      {
        clientSecret: paymentResult.clientSecret,
        paymentIntentId: paymentResult.paymentIntentId,
        amountCents: serverTotalCents,
        currency: paymentResult.currency,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('POST /api/checkout/create-intent error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
