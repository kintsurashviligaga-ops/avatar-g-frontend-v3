import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/stripe/webhooks';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// Force dynamic rendering (webhooks must run at request time)
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs'; // Stripe requires nodejs runtime

// ========================================
// POST /api/webhooks/stripe
// ========================================
// Handle Stripe webhooks (idempotent)

export async function POST(request: NextRequest) {
  try {
    // 1. Read raw body for signature verification
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    // 2. Verify webhook signature
    const event = verifyWebhookSignature({ body, signature });

    if (!event) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log('Stripe webhook received:', event.type, event.id);

    // 3. Idempotency check: has this event been processed?
    const supabase = createSupabaseServerClient();
    const { data: existingEvent } = await supabase
      .from('stripe_events')
      .select('id')
      .eq('id', event.id)
      .single();

    if (existingEvent) {
      console.log('Event already processed:', event.id);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // 4. Record event (before processing - for idempotency)
    await supabase
      .from('stripe_events')
      .insert([
        {
          id: event.id,
          type: event.type,
          payload_json: event.data.object,
          created_at: new Date(event.created * 1000).toISOString(),
        },
      ])
      .select()
      .single();

    // 5. Handle based on event type
    if (event.type === 'payment_intent.succeeded') {
      await handlePaymentSucceeded(event, supabase);
    } else if (event.type === 'payment_intent.payment_failed') {
      await handlePaymentFailed(event, supabase);
    } else if (event.type === 'charge.refunded') {
      await handleRefund(event, supabase);
    }

    // 6. Mark as processed
    await supabase
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id);

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

// ========================================
// PAYMENT SUCCESS HANDLER
// ========================================

async function handlePaymentSucceeded(event: any, supabaseClient: any) {
  try {
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.metadata?.orderId;
    const storeId = paymentIntent.metadata?.storeId;

    if (!orderId || !storeId) {
      console.error('Missing metadata in payment intent');
      return;
    }

    // 1. Update payment attempt status
    await supabaseClient
      .from('payment_attempts')
      .update({
        status: 'succeeded',
        confirmed_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntent.id);

    // 2. Update order status to paid
    const { error: updateOrderError } = await supabaseClient
      .from('orders')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateOrderError) {
      console.error('Error updating order:', updateOrderError);
      return;
    }

    // 3. Write ledger entry (existing ledger logic)
    const { data: order } = await supabaseClient
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (order) {
      await supabaseClient
        .from('payments_ledger')
        .insert([
          {
            order_id: orderId,
            store_id: storeId,
            amount_cents: order.total_cents,
            payment_method: 'stripe',
            stripe_payment_intent_id: paymentIntent.id,
            status: 'completed',
            created_at: new Date().toISOString(),
          },
        ]);
    }

    // 4. Trigger invoice generation
    // This would be called via a background job or direct function call
    // For now, we'll Just log it - in production use Bull, Temporal, etc.
    console.log('Invoice generation triggered for order:', orderId);

    console.log('Payment succeeded for order:', orderId);
  } catch (error) {
    console.error('Error handling payment success:', error);
  }
}

// ========================================
// PAYMENT FAILURE HANDLER
// ========================================

async function handlePaymentFailed(event: any, supabaseClient: any) {
  try {
    const paymentIntent = event.data.object;
    const orderId = paymentIntent.metadata?.orderId;

    if (!orderId) {
      console.error('Missing orderId in payment intent');
      return;
    }

    // Update payment attempt status
    await supabaseClient
      .from('payment_attempts')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
      })
      .eq('payment_intent_id', paymentIntent.id);

    console.log('Payment failed for order:', orderId);
  } catch (error) {
    console.error('Error handling payment failure:', error);
  }
}

// ========================================
// REFUND HANDLER
// ========================================

async function handleRefund(event: any, supabaseClient: any) {
  try {
    const charge = event.data.object;
    const orderId = charge.metadata?.orderId;

    if (!orderId) {
      console.error('Missing orderId in charge');
      return;
    }

    // Find original payment attempt
    const { data: paymentAttempt } = await supabaseClient
      .from('payment_attempts')
      .select('*')
      .eq('payment_intent_id', charge.payment_intent)
      .single();

    if (paymentAttempt) {
      // Update payment attempt with refund info
      await supabaseClient
        .from('payment_attempts')
        .update({
          status: 'refunded',
          refund_cents: charge.refunded,
        })
        .eq('id', paymentAttempt.id);

      // Write ledger adjustment
      await supabaseClient
        .from('payments_ledger')
        .insert([
          {
            order_id: orderId,
            store_id: paymentAttempt.store_id,
            amount_cents: -(charge.refunded || 0),
            payment_method: 'stripe',
            stripe_payment_intent_id: charge.payment_intent,
            status: 'refunded',
            created_at: new Date().toISOString(),
          },
        ]);
    }

    console.log('Refund processed for order:', orderId);
  } catch (error) {
    console.error('Error handling refund:', error);
  }
}
