'use client';

/**
 * AdminDashboard — the complete admin control panel (client).
 * Tabs: Overview (KPIs + pipeline health) · Users (search + credit grant) · Activity (generations + failures).
 * All privileged data/actions go through admin-gated API routes; this component only renders + calls them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import AdminSignOutButton from '@/components/admin/AdminSignOutButton';
import FeatureFlags from '@/components/admin/FeatureFlags';
import BillingConfig from '@/components/admin/BillingConfig';
import JobsMonitor from '@/components/admin/JobsMonitor';
import ReliabilityPanel from '@/components/admin/ReliabilityPanel';
import LaunchHealthCard from '@/components/admin/LaunchHealthCard';
import type { AdminStats } from '@/lib/admin/stats';
import type { AdminUserPage, AdminUserRow } from '@/lib/admin/users';
import type { PipelineHealth } from '@/lib/pipeline/statusAgent';

type Tab = 'overview' | 'reliability' | 'users' | 'activity' | 'billing' | 'jobs' | 'flags';
type Accent = 'default' | 'green' | 'red' | 'cyan' | 'amber';

const ACCENT: Record<Accent, string> = {
  default: 'text-white', green: 'text-emerald-400', red: 'text-rose-400', cyan: 'text-cyan-400', amber: 'text-amber-400',
};

interface Props {
  locale: string;
  stats: AdminStats;
  initialUsers: AdminUserPage;
  pipelineHealth: PipelineHealth | null;
}

function Stat({ label, value, sub, accent = 'default' }: { label: string; value: string | number; sub?: string; accent?: Accent }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5 transition-colors hover:bg-white/[0.05]">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1.5 text-[26px] font-bold leading-none tabular-nums ${ACCENT[accent]}`}>{value}</p>
      <p className="mt-1.5 h-[13px] text-[11px] leading-none text-gray-500">{sub ?? ''}</p>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-[17px] font-semibold leading-none tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-[10px] leading-none text-gray-600">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard({ locale, stats, initialUsers, pipelineHealth }: Props) {
  const ka = locale === 'ka';
  const [tab, setTab] = useState<Tab>('overview');
  const top = stats.byService[0];
  const fmt = useCallback((iso: string) => {
    try { return new Date(iso).toLocaleString(ka ? 'ka-GE' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
  }, [ka]);

  const health = pipelineHealth?.overall;
  const healthLabel = health === 'healthy' ? (ka ? 'ჯანმრთელი' : 'Healthy') : health === 'degraded' ? (ka ? 'დეგრადირებული' : 'Degraded') : health === 'critical' ? (ka ? 'კრიტიკული' : 'Critical') : '';
  const healthClass = health === 'healthy' ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' : health === 'degraded' ? 'bg-amber-500/15 text-amber-400 ring-amber-500/20' : 'bg-rose-500/15 text-rose-400 ring-rose-500/20';

  const TABS: { id: Tab; label: string }[] = [
    { id: 'overview', label: ka ? 'მიმოხილვა' : 'Overview' },
    { id: 'reliability', label: ka ? 'სანდოობა' : 'Reliability' },
    { id: 'users', label: ka ? 'მომხმარებლები' : 'Users' },
    { id: 'activity', label: ka ? 'აქტივობა' : 'Activity' },
    { id: 'billing', label: ka ? 'ბილინგი' : 'Billing' },
    { id: 'jobs', label: ka ? 'რიგი' : 'Queue' },
    { id: 'flags', label: ka ? 'დროშები' : 'Flags' },
  ];

  return (
    <main className="min-h-dvh bg-[#06060d] px-4 py-6 text-white sm:px-6">
      <div className="mx-auto w-full max-w-6xl space-y-5">
        {/* Native admin top bar — official MyAvatar.ge wordmark, zero marketing chrome. */}
        <header className="flex items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <BrandLogo href={`/${locale}/dashboard`} size="nav" />
            <span className="hidden h-6 w-px bg-white/[0.12] sm:block" />
            <div className="hidden sm:block">
              <p className="text-[13px] font-semibold leading-none text-white">{ka ? 'ადმინი' : 'Admin'}</p>
              <p className="mt-1 text-[11px] leading-none text-gray-500">{ka ? 'მართვის პანელი' : 'Control panel'}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {health && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${healthClass}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${health === 'healthy' ? 'bg-emerald-400' : health === 'degraded' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                {healthLabel}
              </span>
            )}
            <a href={`/${locale}/dashboard`} className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-300 transition-colors hover:bg-white/5 hover:text-white">
              {ka ? '← აპლიკაცია' : '← App'}
            </a>
            <AdminSignOutButton locale={locale} className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50" />
          </div>
        </header>

        {/* Tab bar — fills on desktop, scrolls horizontally on a narrow phone */}
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${tab === t.id ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <Overview ka={ka} stats={stats} top={top} pipelineHealth={pipelineHealth} fmt={fmt} />}
        {tab === 'reliability' && <ReliabilityPanel ka={ka} />}
        {tab === 'users' && <Users ka={ka} initial={initialUsers} fmt={fmt} />}
        {tab === 'activity' && <Activity ka={ka} stats={stats} fmt={fmt} />}
        {tab === 'billing' && <BillingConfig ka={ka} />}
        {tab === 'jobs' && <JobsMonitor ka={ka} />}
        {tab === 'flags' && <FeatureFlags ka={ka} />}
      </div>
    </main>
  );
}

/* ── Overview ─────────────────────────────────────────────────────────────── */
function Overview({ ka, stats, top, pipelineHealth, fmt }: { ka: boolean; stats: AdminStats; top?: { kind: string; count: number }; pipelineHealth: PipelineHealth | null; fmt: (s: string) => string }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={ka ? 'მომხმარებლები' : 'Users'} value={stats.totalUsers} sub={ka ? 'სულ რეგისტრირებული' : 'total registered'} accent="cyan" />
        <Stat label={ka ? 'შემოსავალი' : 'Revenue'} value={`${stats.revenueGel.toFixed(2)} ₾`} sub={ka ? 'შევსებები' : 'top-ups'} accent="green" />
        <Stat label={ka ? 'გენერაცია (სულ)' : 'Generations'} value={stats.gensAllTime} sub={ka ? `${stats.gensWeek} კვირაში` : `${stats.gensWeek} this week`} />
        <Stat label={ka ? 'წარმატება' : 'Success rate'} value={`${stats.successRate}%`} sub={ka ? 'შესრულდა / სულ' : 'done / terminal'} accent={stats.successRate >= 90 ? 'green' : stats.successRate >= 70 ? 'amber' : 'red'} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <MiniStat label={ka ? 'დღეს' : 'Today'} value={stats.gensToday} sub={ka ? 'გენერაცია' : 'generations'} />
        <MiniStat label={ka ? 'აქტიური' : 'Active'} value={stats.dau} sub="DAU" />
        <MiniStat label={ka ? 'წარუმატებელი' : 'Failed'} value={stats.failedGens} sub={ka ? 'რენდერი' : 'renders'} />
        <MiniStat label={ka ? 'პოპულარული' : 'Top service'} value={top ? top.kind : '—'} sub={top ? `${top.count}` : undefined} />
        <MiniStat label={ka ? 'კვირაში' : 'This week'} value={stats.gensWeek} sub={ka ? 'გენერაცია' : 'generations'} />
      </div>
      {pipelineHealth && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'Pipeline სტატუსი' : 'Pipeline status'}</h2>
            <span className="text-[10px] text-gray-600">{ka ? 'განახლდა' : 'Updated'} {fmt(pipelineHealth.checkedAt)}</span>
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
              {pipelineHealth.warnings.map((w) => <p key={w} className="text-[10.5px] text-amber-300/70">• {w}</p>)}
            </div>
          )}
        </section>
      )}
      {/* Launch readiness — live /api/health/memory checklist (migration 007 + env keys). */}
      <LaunchHealthCard ka={ka} />
    </div>
  );
}

/* ── Users ────────────────────────────────────────────────────────────────── */
function Users({ ka, initial, fmt }: { ka: boolean; initial: AdminUserPage; fmt: (s: string) => string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AdminUserPage>(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The initial page ('' query) is already provided by the server — never refetch it on mount. Tracking
  // the last-fetched query (vs a first-render flag) is robust to React strict-mode's double-invoked effect.
  const lastQuery = useRef('');

  const load = useCallback(async (query: string, pg: number) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&page=${pg}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as AdminUserPage);
    } catch {
      setErr(ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load');
    } finally { setLoading(false); }
  }, [ka]);

  // Debounced search — fires only when the query actually changes from what's already displayed.
  useEffect(() => {
    if (q === lastQuery.current) return;
    const id = setTimeout(() => { lastQuery.current = q; setPage(0); load(q, 0); }, 350);
    return () => clearTimeout(id);
  }, [q, load]);

  const goPage = (pg: number) => { setPage(pg); load(q, pg); };
  const onGranted = (id: string, newBalance: number) =>
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, credits_balance: newBalance } : u)) }));

  const pageSize = 25;
  const maxPage = Math.max(0, Math.ceil(data.total / pageSize) - 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ka ? 'ძებნა ელფოსტით ან სახელით…' : 'Search by email or name…'}
          className="flex-1 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-gray-600 focus:border-cyan-500/40 focus:outline-none"
        />
        <span className="shrink-0 text-[12px] text-gray-500">{data.total} {ka ? 'სულ' : 'total'}</span>
      </div>

      {err && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{err}</p>}

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/[0.08] px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">
          <span>{ka ? 'მომხმარებელი' : 'User'}</span>
          <span className="text-right">{ka ? 'კრედიტი' : 'Credits'}</span>
          <span className="text-right">{ka ? 'მოქმედება' : 'Action'}</span>
        </div>
        {loading ? (
          <p className="px-4 py-6 text-center text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>
        ) : data.users.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-gray-600">{ka ? 'ვერაფერი მოიძებნა' : 'No users found'}</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {data.users.map((u) => <UserRow key={u.id} ka={ka} user={u} fmt={fmt} onGranted={onGranted} />)}
          </ul>
        )}
      </div>

      {maxPage > 0 && (
        <div className="flex items-center justify-center gap-3 text-[12px]">
          <button disabled={page <= 0 || loading} onClick={() => goPage(page - 1)} className="rounded-lg border border-white/10 px-3 py-1 text-gray-300 disabled:opacity-40">‹ {ka ? 'წინა' : 'Prev'}</button>
          <span className="text-gray-500">{page + 1} / {maxPage + 1}</span>
          <button disabled={page >= maxPage || loading} onClick={() => goPage(page + 1)} className="rounded-lg border border-white/10 px-3 py-1 text-gray-300 disabled:opacity-40">{ka ? 'შემდეგი' : 'Next'} ›</button>
        </div>
      )}
    </div>
  );
}

function UserRow({ ka, user, fmt, onGranted }: { ka: boolean; user: AdminUserRow; fmt: (s: string) => string; onGranted: (id: string, bal: number) => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const grant = async () => {
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) { setMsg({ ok: false, text: ka ? 'არასწორი რაოდენობა' : 'Invalid amount' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/admin/credits/grant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amountGel: amt }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; newBalance?: number; error?: string };
      if (!res.ok || !json.ok) { setMsg({ ok: false, text: json.error ?? (ka ? 'შეცდომა' : 'Error') }); return; }
      onGranted(user.id, json.newBalance ?? user.credits_balance + amt);
      setMsg({ ok: true, text: ka ? `+${amt} ✓` : `+${amt} ✓` });
      setAmount(''); setOpen(false);
    } catch {
      setMsg({ ok: false, text: ka ? 'ქსელის შეცდომა' : 'Network error' });
    } finally { setBusy(false); }
  };

  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2.5 text-[12.5px]">
      <div className="min-w-0">
        <p className="truncate text-gray-200">{user.email ?? <span className="text-gray-600">—</span>}</p>
        <p className="truncate text-[11px] text-gray-500">{user.full_name || `${user.id.slice(0, 8)}…`} · {fmt(user.created_at)}</p>
      </div>
      <span className="text-right font-semibold tabular-nums text-cyan-400">{user.credits_balance}</span>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {open ? (
          <div className="flex items-center gap-1">
            <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus
              onKeyDown={(e) => e.key === 'Enter' && grant()}
              placeholder="₾" className="w-14 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[12px] text-white focus:border-cyan-500/50 focus:outline-none" />
            <button disabled={busy} onClick={grant} className="rounded-md bg-cyan-500/20 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50">
              {busy ? '…' : (ka ? 'მიცემა' : 'Grant')}
            </button>
            <button onClick={() => { setOpen(false); setMsg(null); }} className="px-1 text-[13px] text-gray-500 hover:text-gray-300">✕</button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5">
            + {ka ? 'კრედიტი' : 'Credits'}
          </button>
        )}
        {msg && <span className={`text-[11px] ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</span>}
      </div>
    </li>
  );
}

/* ── Activity ─────────────────────────────────────────────────────────────── */
function Activity({ ka, stats, fmt }: { ka: boolean; stats: AdminStats; fmt: (s: string) => string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title={ka ? 'ბოლო რეგისტრაციები' : 'Recent signups'} count={stats.recentSignups.length}>
          {stats.recentSignups.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
              <span className="truncate font-mono text-gray-400">{s.id.slice(0, 8)}…</span>
              <span className="shrink-0 text-gray-500">{fmt(s.created_at)}</span>
            </li>
          ))}
        </ListCard>
        <ListCard title={ka ? 'ბოლო გენერაციები' : 'Recent generations'} count={stats.recentGenerations.length}>
          {stats.recentGenerations.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
              <span className="w-14 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px] font-medium text-gray-300">{g.kind}</span>
              <span className="flex-1 truncate text-center font-mono text-gray-500">{(g.user_id ?? 'anon').slice(0, 8)}</span>
              <span className="shrink-0 text-gray-500">{fmt(g.created_at)}</span>
            </li>
          ))}
        </ListCard>
      </div>
      <section className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? '⚠️ ბოლო წარუმატებლები' : '⚠️ Recent failures'} <span className="text-gray-600">{stats.recentFailures.length}</span></h2>
        {stats.recentFailures.length === 0 ? (
          <p className="text-[12px] text-emerald-400/80">{ka ? 'წარუმატებლობა არ არის — სუფთაა 🎉' : 'No failures — all clear 🎉'}</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {stats.recentFailures.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                <span className="w-14 shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-center text-[10px] font-medium text-rose-300">{f.kind}</span>
                <span className="flex-1 truncate text-center font-mono text-gray-500">{(f.user_id ?? 'anon').slice(0, 8)}</span>
                <span className="shrink-0 text-gray-500">{fmt(f.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ListCard({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{title} <span className="text-gray-600">{count}</span></h2>
      {count === 0 ? <p className="py-3 text-center text-[12px] text-gray-600">—</p> : <ul className="divide-y divide-white/[0.06]">{children}</ul>}
    </div>
  );
}
