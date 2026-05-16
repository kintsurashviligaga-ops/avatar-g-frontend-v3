/**
 * GET /api/admin/creations-stats
 * Admin-only: Returns generation analytics across all users.
 * - Total generations, credits used, daily breakdown, top services.
 * - Restricted to admin email OR admin role in profiles.
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
    if (!isAdmin) {
      // Also check role in profiles
      const supabase = createServiceRoleClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (!profile || profile.role !== 'admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
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

    // 3. Creations by kind
    const kinds = ['image', 'video', 'audio', 'avatar', 'text', 'code'];
    const kindCounts: Record<string, number> = {};
    for (const kind of kinds) {
      const { count } = await supabase
        .from('user_creations')
        .select('*', { count: 'exact', head: true })
        .eq('kind', kind);
      kindCounts[kind] = count ?? 0;
    }

    // 4. Daily creations last 14 days
    const days: Array<{ date: string; count: number; credits: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
      const { data: dayRows } = await supabase
        .from('user_creations')
        .select('credits_used')
        .gte('created_at', start)
        .lt('created_at', end);
      const dayCredits = (dayRows ?? []).reduce((s, r) => s + (r.credits_used ?? 0), 0);
      days.push({
        date: d.toISOString().slice(0, 10),
        count: dayRows?.length ?? 0,
        credits: dayCredits,
      });
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
