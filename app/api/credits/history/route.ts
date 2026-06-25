/**
 * GET /api/credits/history — the user's last N credit transactions (default 10),
 * newest first, for the Settings → History tab. Fail-open: no session / no table /
 * any error → { items: [] } so the tab simply renders empty.
 */
import { NextRequest, NextResponse } from 'next/server';
import { authedClientFromRequest } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export interface CreditTxn {
  action: string;
  creditsDelta: number;
  createdAt: string;
}

export async function GET(req: NextRequest) {
  try {
    const { supabase, user } = await authedClientFromRequest(req);
    if (!user) return NextResponse.json({ items: [] });

    const limitRaw = Number(new URL(req.url).searchParams.get('limit'));
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 10;

    const { data, error } = await supabase
      .from('credit_transactions')
      .select('action, credits_delta, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error || !Array.isArray(data)) return NextResponse.json({ items: [] });

    const items: CreditTxn[] = data.map((r) => ({
      action: String((r as { action?: unknown }).action ?? ''),
      creditsDelta: Number((r as { credits_delta?: unknown }).credits_delta ?? 0),
      createdAt: String((r as { created_at?: unknown }).created_at ?? ''),
    }));
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] }); // fail-open
  }
}
