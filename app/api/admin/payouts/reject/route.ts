import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';

export const dynamic = 'force-dynamic';

const RejectPayoutSchema = z.object({
  payoutRequestId: z.string().uuid(),
  reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ⚠️ THIS GATED A PAYOUT ON A FLAG THE PAYEE COULD WRITE THEMSELVES. The check read
    // `profiles.role` through the CALLER'S OWN anon-key cookie client, and public.profiles is
    // owner-writable by RLS (004_saas_billing_credits.sql: FOR ALL USING auth.uid() = id, no WITH CHECK;
    // 20260216_auth_profiles.sql adds an explicit owner UPDATE). RLS is row-level, not column-level, and
    // nothing restricts the `role` column — so any signed-in user could have set their own role to
    // 'admin' from the browser and then approved their own payout. Real money.
    //
    // It was also dead: no migration creates profiles.role, so the select errors, the predicate is
    // false, and a genuine admin was 403'd here forever. Both halves are why this is not a rename —
    // the gate must never be a value the subject of the decision controls.
    if (!isAdminUser(user)) {
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
