/**
 * GET /api/admin/creations-stats
 * Admin-only: Returns generation analytics across all users.
 * - Total generations, credits used, daily breakdown, top services.
 * - Restricted to the admin email allowlist. Nothing else — see the note on the gate below.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ADMIN_EMAILS = ['kintsurashviligaga@gmail.com', 'kintsurashviligaga-ops@gmail.com'];

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
    }

    const isAdmin = ADMIN_EMAILS.includes(user.email ?? '');
    // ⚠️ THE SECOND HALF OF THIS GATE WAS A FALLBACK TO `profiles.role`, A COLUMN THAT DOES NOT EXIST.
    // The select errored, `profile` came back null, and the branch always denied — so the allowlist was
    // doing all the work and the fallback was dead weight. Removed rather than repaired: a role flag on
    // the user's OWN row is writable by the very person it describes unless RLS forbids it exactly, so
    // "allowlist OR row flag" is only ever as strong as the row flag. One gate, and it is the session
    // email against the server-side list.
    if (!isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceRoleClient();

    // 1. Total creations + credits
    const { count: totalCreations } = await supabase
      .from('user_creations')
      .select('*', { count: 'exact', head: true });

    const { data: creditSum } = await supabase
      .from('user_creations')
      .select('credits_used');

    const totalCredits = (creditSum ?? []).reduce((s: number, r: { credits_used?: number }) => s + (r.credits_used ?? 0), 0);

    // 2. Total unique users
    const { count: totalUsers } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // 3. Creations by kind — the 6 counts run CONCURRENTLY (was 6 serial round-trips; audit LOW).
    const kinds = ['image', 'video', 'audio', 'avatar', 'text', 'code'];
    const kindResults = await Promise.all(
      kinds.map((kind) =>
        supabase.from('user_creations').select('*', { count: 'exact', head: true }).eq('kind', kind)
      )
    );
    const kindCounts: Record<string, number> = {};
    kinds.forEach((kind, i) => { kindCounts[kind] = kindResults[i]?.count ?? 0; });

    // 4. Daily creations last 14 days — ONE windowed query bucketed in JS (was 14 serial queries;
    // audit LOW). Bucketed by UTC day for consistency between the query and the labels.
    const windowStart = new Date(Date.now() - 14 * 86_400_000).toISOString();
    const { data: windowRows } = await supabase
      .from('user_creations')
      .select('created_at, credits_used')
      .gte('created_at', windowStart);
    const byDay = new Map<string, { count: number; credits: number }>();
    for (const r of windowRows ?? []) {
      const day = String(r.created_at ?? '').slice(0, 10);
      if (!day) continue;
      const cur = byDay.get(day) ?? { count: 0, credits: 0 };
      cur.count += 1;
      cur.credits += Number(r.credits_used ?? 0);
      byDay.set(day, cur);
    }
    const days: Array<{ date: string; count: number; credits: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
      const e = byDay.get(key) ?? { count: 0, credits: 0 };
      days.push({ date: key, count: e.count, credits: e.credits });
    }

    // 5. Agent G tasks overview
    const { count: totalTasks } = await supabase
      .from('agent_g_tasks')
      .select('*', { count: 'exact', head: true });

    const { count: failedTasks } = await supabase
      .from('agent_g_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    const { count: completedTasks } = await supabase
      .from('agent_g_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    // 6. Today's stats
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayRows } = await supabase
      .from('user_creations')
      .select('credits_used')
      .gte('created_at', todayStart.toISOString());
    const todayCount = todayRows?.length ?? 0;
    const todayCredits = (todayRows ?? []).reduce((s, r) => s + (r.credits_used ?? 0), 0);

    return NextResponse.json({
      overview: {
        totalCreations: totalCreations ?? 0,
        totalCreditsUsed: totalCredits,
        totalUsers: totalUsers ?? 0,
        totalTasks: totalTasks ?? 0,
        completedTasks: completedTasks ?? 0,
        failedTasks: failedTasks ?? 0,
        errorRate: totalTasks ? Math.round(((failedTasks ?? 0) / totalTasks) * 100) : 0,
        today: { count: todayCount, credits: todayCredits },
      },
      kindBreakdown: kindCounts,
      dailyActivity: days,
    });
  } catch (err) {
    console.error('[admin/creations-stats]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
