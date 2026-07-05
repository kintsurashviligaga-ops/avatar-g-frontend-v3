import { redirect } from 'next/navigation';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';
import { gatherAdminStats, type AdminStats } from '@/lib/admin/stats';
import { checkPipelineHealth, type PipelineHealth } from '@/lib/pipeline/statusAgent';

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

  // Access is granted by EITHER the founder-email override OR a Supabase metadata role — OR-ed, so the
  // email match alone is sufficient and can NEVER be revoked by the metadata branch (an OR only grants).
  // The founder email is therefore already an unconditional bypass of role/header evaluation. If this
  // redirect still fires for the founder account, the cause is upstream: `getUser()` returned null or a
  // different account (e.g. an expired session the RSC can't refresh — cookie writes are a no-op here,
  // see lib/supabase/server.ts setAll). The log turns that silent redirect into a diagnosable signal.
  const emailIsFounder = user?.email?.trim().toLowerCase() === ADMIN_EMAIL;
  const metaRole = isAdminUser(user);
  const isAdmin = emailIsFounder || metaRole;
  if (!isAdmin) {
    // eslint-disable-next-line no-console
    console.warn(`[admin] access denied → /dashboard | hasUser=${!!user} email=${user?.email ?? 'none'} metaRole=${metaRole}`);
    redirect(`/${locale}/dashboard`);
  }

  const EMPTY_STATS: AdminStats = { totalUsers: 0, gensToday: 0, gensWeek: 0, gensAllTime: 0, failedGens: 0, revenueGel: 0, byService: [], recentSignups: [], recentGenerations: [], dau: 0, successRate: 0, recentFailures: [] };
  let stats: AdminStats;
  try {
    const svc = createServiceRoleClient();
    stats = svc ? await gatherAdminStats(svc) : EMPTY_STATS;
  } catch {
    stats = EMPTY_STATS;
  }

  // Pipeline health (env-derived service readiness) — fail-open, never blocks the page.
  const pipelineHealth: PipelineHealth | null = await checkPipelineHealth().catch(() => null);

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

        {/* Pipeline status — env-derived readiness of every media service */}
        {pipelineHealth && (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold">{ka ? 'Pipeline სტატუსი' : 'Pipeline status'}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pipelineHealth.overall === 'healthy' ? 'bg-green-500/20 text-green-400' : pipelineHealth.overall === 'degraded' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                {pipelineHealth.overall === 'healthy' ? (ka ? '✅ ჯანმრთელი' : '✅ Healthy') : pipelineHealth.overall === 'degraded' ? (ka ? '⚠️ დეგრადირებული' : '⚠️ Degraded') : (ka ? '🔴 კრიტიკული' : '🔴 Critical')}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              {pipelineHealth.services.map((s) => (
                <div key={s.service} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[13px]">{s.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-white">{s.service}</p>
                      <p className="truncate text-[10.5px] text-gray-500">{s.provider}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${s.tier === 'high' ? 'bg-green-500/10 text-green-400' : s.tier === 'medium' ? 'bg-yellow-500/10 text-yellow-400' : s.tier === 'low' ? 'bg-orange-500/10 text-orange-400' : 'bg-red-500/10 text-red-400'}`}>
                    {s.tier === 'high' ? 'HD' : s.tier === 'medium' ? 'SD' : s.tier === 'low' ? 'LOW' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
            {pipelineHealth.warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-yellow-500/20 bg-yellow-950/30 p-2.5">
                <p className="mb-1 text-[11px] font-medium text-yellow-400">{ka ? '⚠️ გაფრთხილებები' : '⚠️ Warnings'}</p>
                {pipelineHealth.warnings.map((w) => (
                  <p key={w} className="text-[10.5px] text-yellow-300/70">• {w}</p>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10px] text-gray-600">{ka ? 'განახლდა' : 'Updated'}: {fmtDate(pipelineHealth.checkedAt)}</p>
          </div>
        )}
      </div>
    </main>
  );
}
