import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const RejectPayoutSchema = z.object({
  payoutRequestId: z.string().uuid(),
  reason: z.string().optional(),
});

async function isAdmin(userId: string, supabase: any): Promise<boolean> {
  const { data: user } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();
  return user?.role === 'admin';
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin status
    if (!(await isAdmin(user.id, supabase))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = RejectPayoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      }, { status: 400 });
    }

    // Update payout request status
    const { data: updated } = await supabase
      .from('payout_requests')
      .update({ status: 'rejected', rejection_reason: parsed.data.reason || null })
      .eq('id', parsed.data.payoutRequestId)
      .select()
      .single();

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[POST /api/admin/payouts/reject]', error);
    return NextResponse.json({ error: 'Failed to reject payout' }, { status: 500 });
  }
}
