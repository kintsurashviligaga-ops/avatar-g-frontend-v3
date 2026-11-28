/**
 * GET /api/credits/history — the user's last N credit movements (default 10), newest first, for the
 * Settings → History tab. Read from public.credit_ledger, the ledger the server-side RPCs write (owner-only
 * SELECT under RLS), NOT from a client-written feed: the old POST /api/credits/record let the browser
 * write any `creditsDelta` it liked into the history. Fail-open: no session / no table / any error →
 * { items: [] } so the tab simply renders empty.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';
import { ledgerRowsToHistory, type CreditHistoryItem, type LedgerRow } from '@/lib/billing/creditHistory';
import { settings825On } from '@/lib/profile/displayName';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type CreditTxn = CreditHistoryItem;

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await authedClientFromRequest(req);
    // Phase 8.25 (NEXT_PUBLIC_SETTINGS_825=1): say WHY the list is empty, so Settings can show „session expired" or
    // „could not load" instead of „No transactions yet". `items: []` stays in the body for older clients.
    const honest = settings825On();
    if (!user) return honest ? NextResponse.json({ items: [], error: 'unauthenticated' }, { status: 401 }) : NextResponse.json({ items: [] });

    const limitRaw = Number(new URL(req.url).searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 10;

    const { data, error } = await supabase
      .from('credit_ledger')
      .select('delta, reason, metadata, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data)) return honest ? NextResponse.json({ items: [], error: 'unavailable' }, { status: 503 }) : NextResponse.json({ items: [] });
    return NextResponse.json({ items: ledgerRowsToHistory(data as LedgerRow[]) });
  } catch {
    if (settings825On()) return NextResponse.json({ items: [], error: 'unavailable' }, { status: 503 });
    return NextResponse.json({ items: [] }); // fail-open
  }
}
