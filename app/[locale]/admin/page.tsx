import { redirect } from 'next/navigation';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { isAdminUser } from '@/lib/admin/guard';
import { gatherAdminStats, type AdminStats } from '@/lib/admin/stats';
import { checkPipelineHealth, type PipelineHealth } from '@/lib/pipeline/statusAgent';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const ADMIN_EMAIL = 'kintsurashviligaga@gmail.com';

type Props = { params: Promise<{ locale: string }> };
type Accent = 'default' | 'green' | 'red' | 'cyan' | 'amber';

const ACCENT: Record<Accent, string> = {
  default: 'text-white',
  green: 'text-emerald-400',
  red: 'text-rose-400',
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
};

/** Prominent headline KPI. */
function Stat({ label, value, sub, accent = 'default' }: { label: string; value: string | number; sub?: string; accent?: Accent }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-colors hover:bg-white/[0.05]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1.5 text-[26px] font-bold leading-none tabular-nums ${ACCENT[accent]}`}>{value}</p>
      <p className="mt-1.5 h-[13px] text-[11px] leading-none text-gray-500">{sub ?? ''}</p>
    </div>
  );
}

/** Compact secondary metric. */
function MiniStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-[17px] font-semibold leading-none tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-[10px] leading-none text-gray-600">{sub}</p>}
    </div>
  );
}

function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-2.5 flex items-baseline gap-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{children}</h2>
      {count !== undefined && <span className="text-[11px] font-medium text-gray-600">{count}</span>}
    </div>
  );
}

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Access is granted by EITHER the founder-email override OR a Supabase metadata role — OR-ed, so the
  // email match alone is sufficient and can NEVER be revoked by the metadata branch. If this redirect
  // still fires for the founder, the cause is upstream (getUser() returned null / a different account);
  // the log turns that silent redirect into a diagnosable signal.
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

  const pipelineHealth: PipelineHealth | null = await checkPipelineHealth().catch(() => null);

  const ka = locale === 'ka';
  const top = stats.byService[0];
  const fmtDate = (iso: string) => { try { return new Date(iso).toLocaleString(ka ? 'ka-GE' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };
  const health = pipelineHealth?.overall;
  const healthLabel = health === 'healthy' ? (ka ? 'ჯანმრთელი' : 'Healthy') : health === 'degraded' ? (ka ? 'დეგრადირებული' : 'Degraded') : health === 'critical' ? (ka ? 'კრიტიკული' : 'Critical') : '';
  const healthClass = health === 'healthy' ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' : health === 'degraded' ? 'bg-amber-500/15 text-amber-400 ring-amber-500/20' : 'bg-rose-500/15 text-rose-400 ring-rose-500/20';

  return (
    <main className="min-h-dvh bg-[#06060d] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-bold tracking-tight">{ka ? 'ადმინი' : 'Admin'}</h1>
            <p className="mt-0.5 text-[12.5px] text-gray-500">{ka ? 'პლატფორმის მართვის პანელი' : 'Platform control panel'}</p>
          </div>
          {health && (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${healthClass}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${health === 'healthy' ? 'bg-emerald-400' : health === 'degraded' ? 'bg-amber-400' : 'bg-rose-400'}`} />
              {healthLabel}
            </span>
          )}
        </header>

        {/* Headline KPIs */}
        <section>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={ka ? 'მომხმარებლები' : 'Users'} value={stats.totalUsers} sub={ka ? 'სულ რეგისტრირებული' : 'total registered'} accent="cyan" />
            <Stat label={ka ? 'შემოსავალი' : 'Revenue'} value={`${stats.revenueGel.toFixed(2)} ₾`} sub={ka ? 'შევსებები' : 'top-ups'} accent="green" />
            <Stat label={ka ? 'გენერაცია (სულ)' : 'Generations'} value={stats.gensAllTime} sub={ka ? `${stats.gensWeek} კვირაში` : `${stats.gensWeek} this week`} />
            <Stat label={ka ? 'წარმატება' : 'Success rate'} value={`${stats.successRate}%`} sub={ka ? 'შესრულდა / სულ' : 'done / terminal'} accent={stats.successRate >= 90 ? 'green' : stats.successRate >= 70 ? 'amber' : 'red'} />
          </div>

          {/* Secondary metrics */}
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            <MiniStat label={ka ? 'დღეს' : 'Today'} value={stats.gensToday} sub={ka ? 'გენერაცია' : 'generations'} />
            <MiniStat label={ka ? 'აქტიური' : 'Active'} value={stats.dau} sub="DAU" />
            <MiniStat label={ka ? 'წარუმატებელი' : 'Failed'} value={stats.failedGens} sub={ka ? 'რენდერი' : 'renders'} />
            <MiniStat label={ka ? 'პოპულარული' : 'Top service'} value={top ? top.kind : '—'} sub={top ? `${top.count}` : undefined} />
            <MiniStat label={ka ? 'კვირაში' : 'This week'} value={stats.gensWeek} sub={ka ? 'გენერაცია' : 'generations'} />
          </div>
        </section>

        {/* Recent activity */}
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <SectionTitle count={stats.recentSignups.length}>{ka ? 'ბოლო რეგისტრაციები' : 'Recent signups'}</SectionTitle>
            {stats.recentSignups.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-gray-600">—</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {stats.recentSignups.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                    <span className="truncate font-mono text-gray-400">{s.id.slice(0, 8)}…</span>
                    <span className="shrink-0 text-gray-500">{fmtDate(s.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <SectionTitle count={stats.recentGenerations.length}>{ka ? 'ბოლო გენერაციები' : 'Recent generations'}</SectionTitle>
            {stats.recentGenerations.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-gray-600">—</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {stats.recentGenerations.map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                    <span className="w-14 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px] font-medium text-gray-300">{g.kind}</span>
                    <span className="flex-1 truncate text-center font-mono text-gray-500">{(g.user_id ?? 'anon').slice(0, 8)}</span>
                    <span className="shrink-0 text-gray-500">{fmtDate(g.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Recent failures */}
        <section className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
          <SectionTitle count={stats.recentFailures.length}>{ka ? '⚠️ ბოლო წარუმატებლები' : '⚠️ Recent failures'}</SectionTitle>
          {stats.recentFailures.length === 0 ? (
            <p className="text-[12px] text-emerald-400/80">{ka ? 'წარუმატებლობა არ არის — სუფთაა 🎉' : 'No failures — all clear 🎉'}</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {stats.recentFailures.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                  <span className="w-14 shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-center text-[10px] font-medium text-rose-300">{f.kind}</span>
                  <span className="flex-1 truncate text-center font-mono text-gray-500">{(f.user_id ?? 'anon').slice(0, 8)}</span>
                  <span className="shrink-0 text-gray-500">{fmtDate(f.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pipeline status */}
        {pipelineHealth && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between">
              <SectionTitle>{ka ? 'Pipeline სტატუსი' : 'Pipeline status'}</SectionTitle>
              <span className="text-[10px] text-gray-600">{ka ? 'განახლდა' : 'Updated'} {fmtDate(pipelineHealth.checkedAt)}</span>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {pipelineHealth.services.map((s) => (
                <div key={s.service} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-2.5 py-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-[13px]">{s.icon}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-white">{s.service}</p>
                      <p className="truncate text-[10.5px] text-gray-500">{s.provider}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${s.tier === 'high' ? 'bg-emerald-500/10 text-emerald-400' : s.tier === 'medium' ? 'bg-amber-500/10 text-amber-400' : s.tier === 'low' ? 'bg-orange-500/10 text-orange-400' : 'bg-rose-500/10 text-rose-400'}`}>
                    {s.tier === 'high' ? 'HD' : s.tier === 'medium' ? 'SD' : s.tier === 'low' ? 'LOW' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
            {pipelineHealth.warnings.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-950/30 p-2.5">
                <p className="mb-1 text-[11px] font-medium text-amber-400">{ka ? '⚠️ გაფრთხილებები' : '⚠️ Warnings'}</p>
                {pipelineHealth.warnings.map((w) => (
                  <p key={w} className="text-[10.5px] text-amber-300/70">• {w}</p>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
