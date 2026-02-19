// API: Create refund (admin/seller action)
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@/lib/supabase/server';
import { RefundService } from '@/lib/refunds/RefundService';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { orderId, returnRequestId, amountCents, reason } = body;

    if (!orderId) {
      return NextResponse.json({ error: 'Missing orderId' }, { status: 400 });
    }

    // Create refund
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
    }

    const stripe = new Stripe(stripeSecretKey);
    const refundService = new RefundService(supabase, stripe);
    const result = await refundService.createRefund({
      orderId,
      returnRequestId,
      amountCents,
      reason,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to create refund' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      refundId: result.refundId,
      stripeRefundId: result.stripeRefundId,
    });
  } catch (error) {
    console.error('Error creating refund:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
