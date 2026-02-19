// API: Get refund details
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { RefundService } from '@/lib/refunds/RefundService';
import { getStripe } from '@/lib/billing/stripe';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    const refundService = new RefundService(supabase, getStripe());
    const refund = await refundService.getRefund(params.id);

    if (!refund) {
      return NextResponse.json({ error: 'Refund not found' }, { status: 404 });
    }

    return NextResponse.json({ refund });
  } catch (error) {
    console.error('Error fetching refund:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
