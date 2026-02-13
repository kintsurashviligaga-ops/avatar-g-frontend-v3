import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PayoutRequestSchema = z.object({
  storeId: z.string().uuid(),
  amountCents: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = PayoutRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    const input = parsed.data;

    // Verify store ownership
    const { data: store } = await supabase
      .from('stores')
      .select('user_id')
      .eq('id', input.storeId)
      .single();

    if (!store || store.user_id !== user.id) {
      return NextResponse.json({ error: 'Store not found or unauthorized' }, { status: 403 });
    }

    // Create payout request
    const { data: payoutRequest } = await supabase
      .from('payout_requests')
      .insert({
        store_id: input.storeId,
        amount_cents: input.amountCents,
        status: 'requested',
      })
      .select()
      .single();

    return NextResponse.json({
      data: payoutRequest,
    });
  } catch (error) {
    console.error('[POST /api/payouts/request]', error);
    return NextResponse.json({ error: 'Failed to create payout request' }, { status: 500 });
  }
}
