import { redirect } from 'next/navigation';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';
import { gatherAdminStats, type AdminStats } from '@/lib/admin/stats';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'kintsurashviligaga@gmail.com';

type Props = { params: Promise<{ locale: string }> };

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="mt-1 text-[28px] font-bold tabular-nums text-white">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isAdmin = isAdminUser(user) || (user?.email?.toLowerCase() === ADMIN_EMAIL);
  if (!isAdmin) redirect(`/${locale}/dashboard`);

  const EMPTY_STATS: AdminStats = { totalUsers: 0, gensToday: 0, gensWeek: 0, gensAllTime: 0, failedGens: 0, revenueGel: 0, byService: [], recentSignups: [], recentGenerations: [], dau: 0, successRate: 0, recentFailures: [] };
  let stats: AdminStats;
  try {
    const svc = createServiceRoleClient();
    stats = svc ? await gatherAdminStats(svc) : EMPTY_STATS;
  } catch {
    stats = EMPTY_STATS;
  }

  const ka = locale === 'ka';
  const top = stats.byService[0];
  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString(ka ? 'ka-GE' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

  return (
    <main className="min-h-dvh bg-[#06060d] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-5xl">
        <h1 className="mb-5 text-[22px] font-bold tracking-tight">{ka ? 'ადმინი' : 'Admin'}</h1>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Card label={ka ? 'მომხმარებლები' : 'Users'} value={stats.totalUsers} />
          <Card label={ka ? 'შემოსავალი' : 'Revenue'} value={`${stats.revenueGel.toFixed(2)} ₾`} sub={ka ? 'შევსებები' : 'top-ups'} />
          <Card label={ka ? 'გენერაცია (დღეს)' : 'Gens today'} value={stats.gensToday} />
          <Card label={ka ? 'გენერაცია (კვირა)' : 'Gens this week'} value={stats.gensWeek} />
          <Card label={ka ? 'გენერაცია (სულ)' : 'Gens all time'} value={stats.gensAllTime} />
          <Card label={ka ? 'წარუმატებელი' : 'Failed gens'} value={stats.failedGens} />
          <Card label={ka ? 'პოპულარული' : 'Top service'} value={top ? top.kind : '—'} sub={top ? `${top.count}` : undefined} />
          {/* PHASE 8 — operational health */}
          <Card label={ka ? 'აქტიური (დღეს)' : 'Active today'} value={stats.dau} sub={ka ? 'DAU' : 'DAU'} />
          <Card label={ka ? 'წარმატება' : 'Success rate'} value={`${stats.successRate}%`} sub={ka ? 'შესრულდა/სულ' : 'done / terminal'} />
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {/* Recent signups */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="mb-2 text-[13px] font-semibold">{ka ? 'ბოლო რეგისტრაციები' : 'Recent signups'} ({stats.recentSignups.length})</p>
            {stats.recentSignups.length === 0 ? (
              <p className="text-[12px] text-gray-500">—</p>
            ) : (
              <ul className="space-y-1 text-[12px] text-gray-300">
                {stats.recentSignups.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-gray-400">{s.id.slice(0, 8)}…</span>
                    <span className="shrink-0 text-gray-500">{fmtDate(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent generations */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <p className="mb-2 text-[13px] font-semibold">{ka ? 'ბოლო გენერაციები' : 'Recent generations'} ({stats.recentGenerations.length})</p>
            {stats.recentGenerations.length === 0 ? (
              <p className="text-[12px] text-gray-500">—</p>
            ) : (
              <ul className="space-y-1 text-[12px] text-gray-300">
                {stats.recentGenerations.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2">
                    <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10.5px] text-gray-300">{g.kind}</span>
                    <span className="truncate font-mono text-gray-500">{(g.user_id ?? 'anon').slice(0, 8)}</span>
                    <span className="shrink-0 text-gray-500">{fmtDate(g.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* PHASE 8 — recent failures panel (diagnose what's breaking) */}
        <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4">
          <p className="mb-2 text-[13px] font-semibold text-red-300">{ka ? '⚠️ ბოლო წარუმატებლები' : '⚠️ Recent failures'} ({stats.recentFailures.length})</p>
          {stats.recentFailures.length === 0 ? (
            <p className="text-[12px] text-gray-500">{ka ? 'წარუმატებლობა არ არის — სუფთაა 🎉' : 'No failures — all clear 🎉'}</p>
          ) : (
            <ul className="space-y-1 text-[12px] text-gray-300">
              {stats.recentFailures.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10.5px] text-red-300">{f.kind}</span>
                  <span className="truncate font-mono text-gray-500">{(f.user_id ?? 'anon').slice(0, 8)}</span>
                  <span className="shrink-0 text-gray-500">{fmtDate(f.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
