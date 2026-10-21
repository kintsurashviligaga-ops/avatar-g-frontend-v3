'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import AdminSignOutButton from '@/components/admin/AdminSignOutButton';
import FeatureFlags from '@/components/admin/FeatureFlags';
import BillingConfig from '@/components/admin/BillingConfig';
import JobsMonitor from '@/components/admin/JobsMonitor';
import ReliabilityPanel from '@/components/admin/ReliabilityPanel';
import LaunchHealthCard from '@/components/admin/LaunchHealthCard';
import SupportInbox from '@/components/admin/SupportInbox';
import AdminsPanel from '@/components/admin/AdminsPanel';
import LiveVisitors from '@/components/admin/LiveVisitors';
import DashboardPanel from '@/components/admin/DashboardPanel';
import UserDrawer from '@/components/admin/UserDrawer';
import PricesPanel from '@/components/admin/PricesPanel';
import ServiceSwitches from '@/components/admin/ServiceSwitches';
import BogReadiness from '@/components/admin/BogReadiness';
import type { AdminStats } from '@/lib/admin/stats';
import type { AdminUserPage, AdminUserRow } from '@/lib/admin/users';
import type { PipelineHealth } from '@/lib/pipeline/statusAgent';

type Tab =
  | 'dashboard'
  | 'users'
  | 'support'
  | 'services'
  | 'prices'
  | 'overview'
  | 'reliability'
  | 'activity'
  | 'billing'
  | 'jobs'
  | 'flags'
  | 'admins';

type Accent = 'default' | 'green' | 'red' | 'cyan' | 'amber';

const ACCENT: Record<Accent, string> = {
  default: 'text-white',
  green: 'text-emerald-400',
  red: 'text-rose-400',
  cyan: 'text-cyan-400',
  amber: 'text-amber-400',
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
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1.5 text-[26px] font-bold leading-none tabular-nums ${ACCENT[accent]}`}>{value}</p>
      <p className="mt-1.5 min-h-[13px] text-[11px] leading-none text-gray-500">{sub ?? ''}</p>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-[17px] font-semibold leading-none tabular-nums text-gray-100">{value}</p>
      {sub && <p className="mt-1 text-[10px] leading-none text-gray-500">{sub}</p>}
    </div>
  );
}

export default function AdminDashboard({ locale, stats: initialStats, initialUsers, pipelineHealth: initialHealth }: Props) {
  const ka = locale === 'ka';
  const [tab, setTab] = useState<Tab>('dashboard');
  const [stats, setStats] = useState<AdminStats>(initialStats);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealth | null>(initialHealth);
  const [refreshing, setRefreshing] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const unread = useSupportUnread();
  const top = stats.byService[0];

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflowY;
    const prevBody = body.style.overflowY;
    html.style.overflowY = 'auto';
    body.style.overflowY = 'auto';
    return () => {
      html.style.overflowY = prevHtml;
      body.style.overflowY = prevBody;
    };
  }, []);

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [tab]);

  const fmt = useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleString(ka ? 'ka-GE' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }, [ka]);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [stRes, hlRes] = await Promise.all([
        fetch('/api/admin/stats', { cache: 'no-store' }).catch(() => null),
        fetch('/api/pipeline/health', { cache: 'no-store' }).catch(() => null),
      ]);
      if (stRes && stRes.ok) {
        const sj = await stRes.json().catch(() => null);
        if (sj && typeof sj.totalUsers === 'number') setStats(sj as AdminStats);
      }
      if (hlRes && hlRes.ok) {
        const hj = await hlRes.json().catch(() => null);
        if (hj && hj.overall) setPipelineHealth(hj as PipelineHealth);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const health = pipelineHealth?.overall;
  const healthLabel =
    health === 'healthy'
      ? ka ? 'ჯანმრთელი' : 'Healthy'
      : health === 'degraded'
        ? ka ? 'დეგრადირებული' : 'Degraded'
        : health === 'critical'
          ? ka ? 'კრიტიკული' : 'Critical'
          : '';
  const healthClass =
    health === 'healthy'
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : health === 'degraded'
        ? 'bg-amber-500/15 text-amber-400 ring-amber-500/20'
        : 'bg-rose-500/15 text-rose-400 ring-rose-500/20';

  const TABS: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: ka ? '📊 დაშბორდი' : '📊 Dashboard' },
    { id: 'users', label: ka ? '👥 მომხმარებლები' : '👥 Users' },
    { id: 'support', label: ka ? '💬 მხარდაჭერა' : '💬 Support' },
    { id: 'services', label: ka ? '⚡ სერვისები' : '⚡ Services' },
    { id: 'prices', label: ka ? '🏷️ ფასები' : '🏷️ Prices' },
    { id: 'overview', label: ka ? '📈 მიმოხილვა' : '📈 Overview' },
    { id: 'jobs', label: ka ? '🎬 რიგი (Jobs)' : '🎬 Queue' },
    { id: 'billing', label: ka ? '💳 ბილინგი' : '💳 Billing' },
    { id: 'reliability', label: ka ? '🛡️ სანდოობა' : '🛡️ Reliability' },
    { id: 'activity', label: ka ? '🕒 აქტივობა' : '🕒 Activity' },
    { id: 'flags', label: ka ? '🚩 დროშები' : '🚩 Flags' },
    { id: 'admins', label: ka ? '🔑 ადმინები' : '🔑 Admins' },
  ];

  return (
    <div
      ref={scrollerRef}
      className="fixed inset-0 z-[100] block h-[100dvh] w-full overflow-y-scroll overflow-x-hidden bg-[#06060d] text-white"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y', overscrollBehaviorY: 'contain' }}
    >
      <div className="mx-auto block w-full max-w-6xl space-y-5 px-4 pb-48 pt-4 sm:px-6">
        {/* Sticky Header + Sticky Tab Bar */}
        <div className="sticky top-0 z-30 -mx-4 space-y-3 border-b border-white/10 bg-[#06060d]/95 px-4 pb-3 pt-2 backdrop-blur-xl sm:-mx-6 sm:px-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <BrandLogo href={`/${locale}/dashboard`} size="nav" />
              <span className="hidden h-6 w-px bg-white/[0.12] sm:block" />
              <div>
                <p className="text-[13.5px] font-semibold leading-none text-white">{ka ? 'ადმინ პანელი' : 'Admin Panel'}</p>
                <p className="mt-1 text-[11px] leading-none text-gray-400">{ka ? 'სრული მართვა და მონიტორინგი' : 'Full Control & Monitoring'}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {health && (
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ring-1 ${healthClass}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${health === 'healthy' ? 'bg-emerald-400' : health === 'degraded' ? 'bg-amber-400' : 'bg-rose-400'}`} />
                  {healthLabel}
                </span>
              )}
              <button
                type="button"
                onClick={() => void refreshAll()}
                disabled={refreshing}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-gray-200 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {refreshing ? '…' : ka ? '↻ განახლება' : '↻ Refresh'}
              </button>
              <a
                href={`/${locale}/admin/veo-smoke`}
                className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[12px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                {ka ? '🎬 Veo ტესტი' : '🎬 Veo Smoke'}
              </a>
              <a
                href={`/${locale}/dashboard`}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
              >
                {ka ? '← სტუდია' : '← Studio'}
              </a>
              <AdminSignOutButton
                locale={locale}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-300 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50"
              />
            </div>
          </header>

          {/* Scrollable Tab Bar */}
          <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-white/[0.03] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all ${
                  tab === t.id
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/30 shadow-sm'
                    : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200'
                }`}
              >
                {t.label}
                {t.id === 'support' && unread > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10.5px] font-bold leading-[18px] text-white">
                    {unread}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Active Tab Content */}
        <div className="block w-full space-y-6 pt-1">
          {tab === 'dashboard' && <DashboardPanel ka={ka} />}
          {tab === 'services' && <ServiceSwitches ka={ka} />}
          {tab === 'prices' && <PricesPanel ka={ka} />}
          {tab === 'overview' && <Overview ka={ka} stats={stats} top={top} pipelineHealth={pipelineHealth} fmt={fmt} />}
          {tab === 'reliability' && <ReliabilityPanel ka={ka} />}
          {tab === 'users' && <Users ka={ka} initial={initialUsers} fmt={fmt} />}
          {tab === 'activity' && <Activity ka={ka} stats={stats} fmt={fmt} />}
          {tab === 'billing' && (
            <div className="space-y-6">
              <BillingConfig ka={ka} />
              <BogReadiness ka={ka} />
            </div>
          )}
          {tab === 'jobs' && <JobsMonitor ka={ka} />}
          {tab === 'flags' && <FeatureFlags ka={ka} />}
          {tab === 'support' && <SupportInbox />}
          {tab === 'admins' && <AdminsPanel ka={ka} />}
        </div>
      </div>
    </div>
  );
}

function useSupportUnread(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const res = await fetch('/api/admin/support/chats?status=all', { cache: 'no-store' });
        if (!res.ok) return;
        const j = (await res.json()) as { chats?: { unread_for_admin?: number }[] };
        if (alive) setN((j.chats ?? []).reduce((sum, c) => sum + (c.unread_for_admin ?? 0), 0));
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = setInterval(() => void tick(), 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  return n;
}

function Overview({
  ka,
  stats,
  top,
  pipelineHealth,
  fmt,
}: {
  ka: boolean;
  stats: AdminStats;
  top?: { kind: string; count: number };
  pipelineHealth: PipelineHealth | null;
  fmt: (s: string) => string;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,240px)_1fr]">
        <LiveVisitors ka={ka} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-2 xl:grid-cols-4">
          <Stat label={ka ? 'მომხმარებლები' : 'Users'} value={stats.totalUsers} sub={ka ? 'სულ რეგისტრირებული' : 'total registered'} accent="cyan" />
          <Stat label={ka ? 'შემოსავალი' : 'Revenue'} value={`${stats.revenueGel.toFixed(2)} ₾`} sub={ka ? 'შევსებები' : 'top-ups'} accent="green" />
          <Stat label={ka ? 'გენერაცია (სულ)' : 'Generations'} value={stats.gensAllTime} sub={ka ? `${stats.gensWeek} კვირაში` : `${stats.gensWeek} this week`} />
          <Stat
            label={ka ? 'წარმატება' : 'Success rate'}
            value={`${stats.successRate}%`}
            sub={ka ? 'შესრულდა / სულ' : 'done / terminal'}
            accent={stats.successRate >= 90 ? 'green' : stats.successRate >= 70 ? 'amber' : 'red'}
          />
        </div>
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
            <span className="text-[10px] text-gray-500">{ka ? 'განახლდა' : 'Updated'} {fmt(pipelineHealth.checkedAt)}</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {pipelineHealth.services.map((s) => (
              <div key={s.service} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="text-[14px]">{s.icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-[12.5px] font-medium text-white">{s.service}</p>
                    <p className="truncate text-[10.5px] text-gray-400">{s.provider}</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    s.tier === 'high'
                      ? 'bg-emerald-500/15 text-emerald-400'
                      : s.tier === 'medium'
                        ? 'bg-amber-500/15 text-amber-400'
                        : s.tier === 'low'
                          ? 'bg-orange-500/15 text-orange-400'
                          : 'bg-rose-500/15 text-rose-400'
                  }`}
                >
                  {s.tier === 'high' ? 'HD' : s.tier === 'medium' ? 'SD' : s.tier === 'low' ? 'LOW' : 'OFF'}
                </span>
              </div>
            ))}
          </div>
          {pipelineHealth.warnings.length > 0 && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-950/30 p-3">
              <p className="mb-1 text-[11px] font-medium text-amber-400">{ka ? '⚠️ გაფრთხილებები' : '⚠️ Warnings'}</p>
              {pipelineHealth.warnings.map((w) => (
                <p key={w} className="text-[11px] text-amber-300/80">• {w}</p>
              ))}
            </div>
          )}
        </section>
      )}
      <LaunchHealthCard ka={ka} />
    </div>
  );
}

function Users({ ka, initial, fmt }: { ka: boolean; initial: AdminUserPage; fmt: (s: string) => string }) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<AdminUserPage>(initial);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const lastQuery = useRef('');

  const load = useCallback(async (query: string, pg: number) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&page=${pg}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as AdminUserPage);
    } catch {
      setErr(ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [ka]);

  useEffect(() => {
    if (q === lastQuery.current) return;
    const id = setTimeout(() => {
      lastQuery.current = q;
      setPage(0);
      void load(q, 0);
    }, 350);
    return () => clearTimeout(id);
  }, [q, load]);

  const goPage = (pg: number) => {
    setPage(pg);
    void load(q, pg);
  };
  const [openId, setOpenId] = useState<string | null>(null);
  const onGranted = (id: string, newBalance: number) =>
    setData((d) => ({ ...d, users: d.users.map((u) => (u.id === id ? { ...u, credits_balance: newBalance } : u)) }));

  const pageSize = 25;
  const maxPage = Math.max(0, Math.ceil(data.total / pageSize) - 1);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ka ? 'ძებნა ელფოსტით ან სახელით…' : 'Search by email or name…'}
          className="min-w-[220px] flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2 text-[13px] text-white placeholder:text-gray-500 focus:border-cyan-500/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void load(q, page)}
          className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px] text-gray-300 hover:bg-white/10"
        >
          {ka ? '↻ განახლება' : '↻ Refresh'}
        </button>
        <span className="shrink-0 text-[12px] font-medium text-gray-400">
          {data.total} {ka ? 'მომხმარებელი' : 'users'}
        </span>
      </div>

      {err && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{err}</p>}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        <div className="min-w-[540px]">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b border-white/[0.08] px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">
            <span>{ka ? 'მომხმარებელი' : 'User'}</span>
            <span className="text-right">{ka ? 'ბალანსი (კრედიტი · ₾)' : 'Balance (Credits · ₾)'}</span>
            <span className="text-right">{ka ? 'მოქმედება' : 'Action'}</span>
          </div>
          {loading ? (
            <p className="px-4 py-8 text-center text-[12px] text-gray-400">{ka ? 'იტვირთება…' : 'Loading…'}</p>
          ) : data.users.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12px] text-gray-500">{ka ? 'ვერაფერი მოიძებნა' : 'No users found'}</p>
          ) : (
            <ul className="divide-y divide-white/[0.06]">
              {data.users.map((u) => (
                <UserRow key={u.id} ka={ka} user={u} fmt={fmt} onGranted={onGranted} onOpen={() => setOpenId(u.id)} />
              ))}
            </ul>
          )}
        </div>
      </div>

      {openId && <UserDrawer ka={ka} userId={openId} fmt={fmt} onBalance={onGranted} onClose={() => setOpenId(null)} />}

      {maxPage > 0 && (
        <div className="flex items-center justify-center gap-3 pt-2 text-[12px]">
          <button
            disabled={page <= 0 || loading}
            onClick={() => goPage(page - 1)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-gray-300 hover:bg-white/5 disabled:opacity-40"
          >
            ‹ {ka ? 'წინა' : 'Prev'}
          </button>
          <span className="tabular-nums text-gray-400">
            {page + 1} / {maxPage + 1}
          </span>
          <button
            disabled={page >= maxPage || loading}
            onClick={() => goPage(page + 1)}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-gray-300 hover:bg-white/5 disabled:opacity-40"
          >
            {ka ? 'შემდეგი' : 'Next'} ›
          </button>
        </div>
      )}
    </div>
  );
}

function UserRow({
  ka,
  user,
  fmt,
  onGranted,
  onOpen,
}: {
  ka: boolean;
  user: AdminUserRow;
  fmt: (s: string) => string;
  onGranted: (id: string, bal: number) => void;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const adjustBalance = async (sign: 1 | -1) => {
    const amt = Math.floor(Number(amount));
    if (!Number.isFinite(amt) || amt <= 0) {
      setMsg({ ok: false, text: ka ? 'არასწორი რაოდენობა' : 'Invalid amount' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/credits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta: sign * amt, note: 'Admin quick adjustment' }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; newBalance?: number; error?: string };
      if (!res.ok || !json.ok) {
        setMsg({ ok: false, text: json.error ?? (ka ? 'შეცდომა' : 'Error') });
        return;
      }
      onGranted(user.id, json.newBalance ?? Math.max(0, user.credits_balance + sign * amt));
      setMsg({ ok: true, text: `${sign > 0 ? '+' : '−'}${amt} კრ ✓` });
      setAmount('');
      setOpen(false);
    } catch {
      setMsg({ ok: false, text: ka ? 'ქსელის შეცდომა' : 'Network error' });
    } finally {
      setBusy(false);
    }
  };

  const gelVal = ((user.credits_balance || 0) * 0.1).toFixed(2);

  return (
    <li className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 text-[12.5px] transition-colors hover:bg-white/[0.02]">
      <button type="button" onClick={onOpen} className="min-w-0 text-left hover:opacity-85">
        <p className="truncate font-medium text-gray-100">{user.email ?? <span className="text-gray-500">—</span>}</p>
        <p className="truncate text-[11px] text-gray-400">
          {user.full_name || `${user.id.slice(0, 8)}…`} · {fmt(user.created_at)} · {ka ? 'გენერაცია' : 'gen'}{' '}
          <span className="tabular-nums text-gray-300">{user.generations ?? '—'}</span>
        </p>
      </button>

      <div className="text-right">
        <span className="font-semibold tabular-nums text-cyan-400">{user.credits_balance} კრ</span>
        <span className="ml-1.5 text-[11px] tabular-nums text-gray-400">({gelVal} ₾)</span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {open ? (
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && void adjustBalance(1)}
              placeholder={ka ? 'კრ' : 'cr'}
              className="w-16 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1 text-[12px] text-white focus:border-cyan-500/50 focus:outline-none"
            />
            <button
              disabled={busy}
              onClick={() => void adjustBalance(1)}
              title={ka ? 'დამატება' : 'Add credits'}
              className="rounded-md bg-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
            >
              {busy ? '…' : '+'}
            </button>
            <button
              disabled={busy}
              onClick={() => void adjustBalance(-1)}
              title={ka ? 'ჩამოჭრა' : 'Deduct credits'}
              className="rounded-md bg-rose-500/20 px-2 py-1 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/30 disabled:opacity-50"
            >
              {busy ? '…' : '−'}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setMsg(null);
              }}
              className="px-1 text-[13px] text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-gray-200 hover:bg-white/10"
          >
            ± {ka ? 'კრედიტი' : 'Credits'}
          </button>
        )}
        <button
          onClick={onOpen}
          className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-500/20"
        >
          {ka ? 'მართვა' : 'Manage'}
        </button>
        {msg && <span className={`text-[11px] font-medium ${msg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{msg.text}</span>}
      </div>
    </li>
  );
}

function Activity({ ka, stats, fmt }: { ka: boolean; stats: AdminStats; fmt: (s: string) => string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <ListCard title={ka ? 'ბოლო რეგისტრაციები' : 'Recent signups'} count={stats.recentSignups.length}>
          {stats.recentSignups.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
              <span className="truncate font-mono text-gray-300">{s.id.slice(0, 8)}…</span>
              <span className="shrink-0 text-gray-400">{fmt(s.created_at)}</span>
            </li>
          ))}
        </ListCard>
        <ListCard title={ka ? 'ბოლო გენერაციები' : 'Recent generations'} count={stats.recentGenerations.length}>
          {stats.recentGenerations.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
              <span className="w-16 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px] font-medium text-gray-200">{g.kind}</span>
              <span className="flex-1 truncate text-center font-mono text-gray-400">{(g.user_id ?? 'anon').slice(0, 8)}</span>
              <span className="shrink-0 text-gray-400">{fmt(g.created_at)}</span>
            </li>
          ))}
        </ListCard>
      </div>
      <section className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
        <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
          {ka ? '⚠️ ბოლო წარუმატებლები' : '⚠️ Recent failures'} <span className="text-gray-500">{stats.recentFailures.length}</span>
        </h2>
        {stats.recentFailures.length === 0 ? (
          <p className="text-[12px] text-emerald-400/90">{ka ? 'წარუმატებლობა არ არის — სუფთაა 🎉' : 'No failures — all clear 🎉'}</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {stats.recentFailures.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                <span className="w-16 shrink-0 rounded bg-rose-500/15 px-1.5 py-0.5 text-center text-[10px] font-medium text-rose-300">{f.kind}</span>
                <span className="flex-1 truncate text-center font-mono text-gray-400">{(f.user_id ?? 'anon').slice(0, 8)}</span>
                <span className="shrink-0 text-gray-400">{fmt(f.created_at)}</span>
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
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-300">
        {title} <span className="text-gray-500">{count}</span>
      </h2>
      {count === 0 ? <p className="py-3 text-center text-[12px] text-gray-500">—</p> : <ul className="divide-y divide-white/[0.06]">{children}</ul>}
    </div>
  );
}
