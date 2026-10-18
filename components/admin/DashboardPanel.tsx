'use client';

/**
 * DashboardPanel — the money and usage view for a rolling window (GET /api/admin/dashboard, lib/admin/dashboard).
 * Revenue, the bank's cut, provider API cost, profit and markup against the owner's 100 % rule, credits sold vs
 * spent, active users, a daily chart and cost per provider. Read-only.
 */
import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary } from '@/lib/admin/dashboard';

const WINDOWS = [1, 7, 30, 90] as const;

const gel = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ₾`;
const pct = (m: number | null) => (m === null ? '—' : `${Math.round(m * 100)}%`);

function Kpi({ label, value, sub, tone = 'text-white' }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1.5 text-[24px] font-bold leading-none tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1.5 min-h-[13px] text-[11px] leading-none text-gray-500">{sub ?? ''}</p>
    </div>
  );
}

/** Revenue vs API cost per day as paired bars; plain SVG, no chart library. */
function DailyChart({ ka, series }: { ka: boolean; series: DashboardSummary['series'] }) {
  if (series.length === 0) return null;
  const max = Math.max(1, ...series.map((d) => Math.max(d.revenueGel, d.apiCostGel)));
  const W = 100 / series.length;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'დღიური: შემოსავალი და API ხარჯი' : 'Daily: revenue and API cost'}</h2>
        <div className="flex gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-400" />{ka ? 'შემოსავალი' : 'Revenue'}</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-400" />{ka ? 'API ხარჯი' : 'API cost'}</span>
        </div>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label={ka ? 'დღიური გრაფიკი' : 'Daily chart'}>
        {series.map((d, i) => {
          const rh = (d.revenueGel / max) * 38;
          const ch = (d.apiCostGel / max) * 38;
          const x = i * W;
          return (
            <g key={d.day}>
              <title>{`${d.day} · ${gel(d.revenueGel)} / ${gel(d.apiCostGel)} · ${d.activeUsers}`}</title>
              <rect x={x + W * 0.1} y={40 - rh} width={W * 0.38} height={rh} className="fill-emerald-400/80" />
              <rect x={x + W * 0.52} y={40 - ch} width={W * 0.38} height={ch} className="fill-rose-400/80" />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-gray-600">
        <span>{series[0]?.day}</span>
        <span>{series[series.length - 1]?.day}</span>
      </div>
    </section>
  );
}

export default function DashboardPanel({ ka }: { ka: boolean }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true); setErr(false);
    try {
      const res = await fetch(`/api/admin/dashboard?days=${d}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setData((await res.json()) as DashboardSummary);
    } catch { setErr(true); } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  const markupTone = data?.markup == null ? 'text-white' : data.markup >= 1 ? 'text-emerald-400' : 'text-rose-400';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          {WINDOWS.map((w) => (
            <button key={w} onClick={() => setDays(w)}
              className={`rounded-lg px-3 py-1 text-[12px] font-medium ${days === w ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {w === 1 ? (ka ? 'დღეს' : 'Today') : ka ? `${w} დღე` : `${w} days`}
            </button>
          ))}
        </div>
        <button onClick={() => void load(days)} disabled={loading} className="rounded-lg border border-white/10 px-3 py-1.5 text-[12px] text-gray-300 hover:bg-white/5 disabled:opacity-50">
          {loading ? '…' : (ka ? 'განახლება' : 'Refresh')}
        </button>
      </div>

      {err && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load'}</p>}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={ka ? 'შემოსავალი' : 'Revenue'} value={gel(data.revenueGel)} sub={`${data.payments} ${ka ? 'გადახდა' : 'payments'}`} tone="text-emerald-400" />
            <Kpi label={ka ? 'API ხარჯი' : 'API cost'} value={gel(data.apiCostGel)} sub={`${ka ? 'ბანკი' : 'Bank'} ${gel(data.bankFeesGel)}`} tone="text-rose-400" />
            <Kpi label={ka ? 'მოგება' : 'Profit'} value={gel(data.grossProfitGel)} sub={ka ? 'შემოსავალი − API − ბანკი' : 'Revenue − API − bank'} tone={data.grossProfitGel >= 0 ? 'text-white' : 'text-rose-400'} />
            <Kpi label={ka ? 'მარჟა' : 'Markup'} value={pct(data.markup)} sub={ka ? 'მიზანი ≥ 100%' : 'Target ≥ 100%'} tone={markupTone} />
            <Kpi label={ka ? 'გაყიდული კრედიტი' : 'Credits sold'} value={data.creditsSold.toLocaleString()} sub={`${data.payingUsers} ${ka ? 'გადამხდელი' : 'payers'}`} tone="text-cyan-400" />
            <Kpi label={ka ? 'დახარჯული კრედიტი' : 'Credits spent'} value={data.creditsSpent.toLocaleString()} sub={`${ka ? 'დაბრუნდა' : 'refunded'} ${data.creditsRefunded} · ${ka ? 'საჩუქარი' : 'comped'} ${data.creditsComped}`} />
            <Kpi label={ka ? 'აქტიური მომხმარებელი' : 'Active users'} value={data.activeUsers} sub={`${ka ? 'დღეს' : 'today'} ${data.activeToday}`} tone="text-amber-400" />
            <Kpi label={ka ? 'ახალი რეგისტრაცია' : 'New signups'} value={data.newSignups} />
          </div>

          <DailyChart ka={ka} series={data.series} />

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'API ხარჯი პროვაიდერის მიხედვით' : 'API cost by provider'}</h2>
            {data.costByProvider.length === 0 ? (
              <p className="py-3 text-center text-[12px] text-gray-600">—</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {data.costByProvider.map((p) => (
                  <li key={p.kind} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                    <span className="truncate text-gray-300">{p.kind}</span>
                    <span className="shrink-0 text-gray-500">{p.calls} {ka ? 'გამოძახება' : 'calls'}</span>
                    <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-rose-300">{gel(p.costGel)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.degraded.length > 0 && (
            <p className="text-[11px] text-amber-400/80">{ka ? 'ნაწილობრივი მონაცემები: ' : 'Partial data: '}{data.degraded.join(', ')}</p>
          )}
        </>
      )}
    </div>
  );
}
