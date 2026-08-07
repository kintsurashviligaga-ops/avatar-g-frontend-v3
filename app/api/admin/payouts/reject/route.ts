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

    // ⚠️ THE ERROR WAS DISCARDED. `const { data: updated }` dropped `error` on the floor, so a failed
    // update — a missing table, an RLS refusal, a bad id — returned 200 with `data: undefined` and the
    // admin read it as "rejected". For a payout that is the worst possible lie: the money decision is
    // reported as made when nothing changed. Surfaced now.
    //
    // ⚠️ AND THE UPDATE WAS UNCONDITIONAL. `.eq('id', …)` alone re-stamps a request that is already
    // rejected, already settled, or already gone the other way — so a double-click, a retried request or
    // a reject-then-approve race silently overwrites the earlier decision with no trace. Guarding on the
    // CURRENT status makes the second call a no-op instead: eq('status', 'pending') matches nothing the
    // second time, `.maybeSingle()` returns null, and we say so rather than pretending.
    const { data: updated, error: updateError } = await supabase
      .from('payout_requests')
      .update({
        status: 'rejected',
        // Who decided, and when. A money action with no author is not auditable, and this pair is the
        // difference between "the payout was rejected" and "somebody rejected the payout".
        rejected_by: user.id,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', parsed.data.payoutRequestId)
      .eq('status', 'pending')
      .select()
      .maybeSingle();

    if (updateError) {
      // eslint-disable-next-line no-console
      console.error('[admin.payouts.reject] update failed', { id: parsed.data.payoutRequestId, admin: user.id, error: updateError.message });
      return NextResponse.json({ error: 'Could not reject this payout request' }, { status: 500 });
    }
    if (!updated) {
      // Not an error — the request was already decided, or the id is unknown. Either way nothing changed
      // and the caller must not be told otherwise.
      return NextResponse.json({ error: 'not_pending', message: 'This payout request is no longer pending' }, { status: 409 });
    }

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error('[POST /api/admin/payouts/reject]', error);
    return NextResponse.json({ error: 'Failed to reject payout' }, { status: 500 });
  }
}
