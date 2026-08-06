import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/auth/adminGuard';
import { checkRateLimit, RATE_LIMITS } from '@/lib/api/rate-limit';

/**
 * GET /api/admin/presence — who is on the site right now.
 *
 * ⚠️ THE WINDOW IS THE DEFINITION. "Active" means a heartbeat within 2 minutes; the client pings every
 * 45s, so a visitor survives one missed ping (a sleeping laptop, a tunnel) without leavers lingering.
 * Change one number and you must change the other, or the count silently means something else.
 *
 * Returns the total, the signed-in share, and a per-section split — the split is what makes the number
 * actionable ("40 people, 35 of them on pricing" is a different morning to "40 in the chat").
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WINDOW_MS = 2 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const limited = await checkRateLimit(req, RATE_LIMITS.READ);
  if (limited) return limited;

  try {
    const svc = createServiceRoleClient();
    // Opportunistic sweep — no cron. Without it a closed tab's row lives forever and the count only
    // ever climbs. Deliberately not awaited into the response path if it fails.
    void svc.rpc('prune_active_visitors').then(() => undefined, () => undefined);

    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { data, error } = await svc
      .from('active_visitors')
      .select('user_id, section')
      .gte('last_seen', since);
    if (error) throw error;

    const rows = data ?? [];
    const bySection: Record<string, number> = {};
    let signedIn = 0;
    for (const r of rows as { user_id: string | null; section: string | null }[]) {
      if (r.user_id) signedIn += 1;
      const k = r.section || 'other';
      bySection[k] = (bySection[k] ?? 0) + 1;
    }

    return NextResponse.json({
      active: rows.length,
      signedIn,
      anonymous: rows.length - signedIn,
      bySection,
      windowSeconds: WINDOW_MS / 1000,
    });
  } catch {
    // Table not migrated yet — say so rather than 500ing the whole overview tab.
    return NextResponse.json({ active: null, signedIn: 0, anonymous: 0, bySection: {}, windowSeconds: WINDOW_MS / 1000, degraded: true });
  }
}
