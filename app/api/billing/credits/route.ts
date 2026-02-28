import { NextResponse } from 'next/server';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { structuredLog } from '@/lib/logger';
import { getSoftCap } from '@/lib/billing/pricingConfig';
import type { CreditsResponse, UserCreditsRow, CreditsLedgerEntry } from '@/types/billing';

export const dynamic = 'force-dynamic';

/**
 * GET /api/billing/credits
 * Returns current user's credit balance, plan, and recent ledger entries.
 */
export async function GET() {
  try {
    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const admin = createServiceRoleClient();

    // Fetch or create user_credits row
    let { data: credits } = await admin
      .from('user_credits')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!credits) {
      // First-time: create default row (trial plan, 0 balance)
      const { data: created, error: createErr } = await admin
        .from('user_credits')
        .insert({ user_id: user.id, plan_id: 'trial', balance: 0 })
        .select('*')
        .single();

      if (createErr) {
        structuredLog('error', 'credits.init_fail', {
          userId: user.id,
          error: createErr.message,
        });
        return NextResponse.json({ error: 'credits_init_failed' }, { status: 500 });
      }
      credits = created;
    }

    const row = credits as UserCreditsRow;

    // Recent ledger entries (last 20)
    const { data: ledger } = await admin
      .from('credits_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const resp: CreditsResponse = {
      plan_id: row.plan_id,
      balance: row.balance,
      period_start: row.period_start,
      period_end: row.period_end,
      soft_cap: getSoftCap(row.plan_id),
      flagged_soft_cap: row.flagged_soft_cap,
      recent: (ledger ?? []) as CreditsLedgerEntry[],
    };

    return NextResponse.json(resp);
  } catch (err) {
    structuredLog('error', 'credits.get.error', {
      error: err instanceof Error ? err.message : 'unknown',
    });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
