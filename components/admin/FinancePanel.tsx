'use client';

/**
 * FinancePanel — the Phase 8.1 founder dashboard (GET /api/admin/finance-v8, lib/billing/margin/report). Read-only.
 * Revenue from BOG, Google Cloud cost (estimated per call until the billing export reconciles the day), net profit and
 * margin, the top credit burners, margin per model and the margin alerts (65 % rule). Shown only when
 * ADMIN_FINANCE_DASHBOARD is on.
 */
import { useCallback, useEffect, useState } from 'react';
import type { FinanceReport } from '@/lib/billing/margin/report';

const WINDOWS = [7, 30, 90] as const;
const gel = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ₾`;
const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)} %`);
const marginTone = (n: number | null) => (n === null ? 'text-gray-400' : n >= 65 ? 'text-emerald-400' : n >= 50 ? 'text-amber-400' : 'text-rose-400');

function Card({ label, value, sub, tone = 'text-white' }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`mt-1.5 text-[24px] font-bold leading-none tabular-nums ${tone}`}>{value}</p>
      <p className="mt-1.5 min-h-[13px] text-[11px] leading-none text-gray-500">{sub ?? ''}</p>
    </div>
  );
}

export default function FinancePanel({ ka }: { ka: boolean }) {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<FinanceReport | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback((d: number) => {
    setLoading(true);
    setErr(false);
    fetch(`/api/admin/finance-v8?days=${d}`, { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<FinanceReport>) : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => load(days), [days, load]);

  if (err) return <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load'}</p>;
  if (!data) return <p className="py-6 text-center text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>;

  const s = data.summary;
  const basis = {
    estimated: ka ? 'შეფასება (ჩვენი აღრიცხვით)' : 'estimated (our per-call log)',
    reconciled: ka ? 'შეჯერებული (Google ბილინგი)' : 'reconciled (Google billing)',
    mixed: ka ? 'ნაწილობრივ შეჯერებული' : 'partly reconciled',
    none: ka ? 'მონაცემი ჯერ არ არის' : 'no data yet',
  }[s.costBasis];
  const maxDay = Math.max(1, ...data.revenueByDay.map((d) => d.gel));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">{ka ? 'ფინანსები' : 'Finance'}</h2>
        <div className="flex gap-1" role="group" aria-label={ka ? 'პერიოდი' : 'Window'}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              aria-pressed={days === w}
              disabled={loading}
              className={`rounded-md px-2.5 py-1 text-[12px] ${days === w ? 'bg-white/15 text-white' : 'bg-white/[0.04] text-gray-400 hover:bg-white/10'}`}
            >
              {ka ? `${w} დღე` : `${w} days`}
            </button>
          ))}
        </div>
      </div>

      {data.unavailable.length > 0 && (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-[12px] text-amber-300">
          {ka ? 'ჯერ მიუწვდომელია: ' : 'Not available yet: '}
          {data.unavailable.join(', ')}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label={ka ? 'შემოსავალი (BOG)' : 'Revenue (BOG)'} value={gel(s.revenueGel)} sub={`${s.ordersCount} ${ka ? 'გადახდა' : 'payments'} · ${ka ? 'წმინდა' : 'net'} ${gel(s.revenueNetGel)}`} />
        <Card label={ka ? 'Google Cloud ხარჯი' : 'Google Cloud cost'} value={usd(s.googleCostUsd)} sub={`${gel(s.googleCostGel)} · ${basis}`} />
        <Card label={ka ? 'წმინდა მოგება' : 'Net profit'} value={gel(s.netProfitGel)} tone={s.netProfitGel >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
        <Card label={ka ? 'მარჟა' : 'Margin'} value={pct(s.marginPct)} tone={marginTone(s.marginPct)} sub={`${ka ? 'ფასიანი მოხმარება' : 'paid usage'} ${pct(s.paidUsageMarginPct)}`} />
      </div>

      {data.revenueByDay.length > 0 && (
        <section aria-label={ka ? 'შემოსავალი დღეების მიხედვით' : 'Revenue by day'} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="flex h-24 items-end gap-[2px]">
            {data.revenueByDay.map((d) => (
              <div key={d.day} title={`${d.day}: ${gel(d.gel)}`} className="flex-1 rounded-t bg-cyan-500/60" style={{ height: `${Math.max(2, (d.gel / maxDay) * 100)}%` }} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-[13px] font-semibold">{ka ? 'მარჟის გაფრთხილებები' : 'Margin alerts'}</h3>
        {data.alerts.length === 0 ? (
          <p className="text-[12px] text-emerald-400">{ka ? 'ყველა მოდელი 65 %-ს ინარჩუნებს.' : 'Every model keeps 65 %.'}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.alerts.map((a, i) => (
              <li
                key={`${a.kind}-${a.capability}-${a.model}-${i}`}
                className={`rounded-lg border px-3 py-2 text-[12px] ${a.severity === 'critical' ? 'border-rose-500/30 bg-rose-500/[0.08] text-rose-200' : 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200'}`}
              >
                <span className="mr-2 font-semibold">{a.kind}</span>
                {ka ? a.message.ka : a.message.en}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold">{ka ? 'მარჟა მოდელების მიხედვით' : 'Margin by model'}</h3>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead className="bg-white/[0.04] text-left text-gray-400">
              <tr>
                <th className="px-3 py-2">{ka ? 'სერვისი / მოდელი' : 'Capability / model'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'გამოძახება' : 'Calls'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'ხარჯი' : 'Cost'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'საშ. ერთზე' : 'Avg / call'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'კრედიტი' : 'Credits'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'მარჟა' : 'Margin'}</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((m) => (
                <tr key={`${m.capability}|${m.model}`} className="border-t border-white/[0.06]">
                  <td className="px-3 py-1.5">
                    {m.capability} <span className="text-gray-500">{m.model}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.calls}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{usd(m.costUsd)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">${m.avgCostUsd.toFixed(4)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{m.creditsCharged}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${marginTone(m.marginPct)}`}>{pct(m.marginPct)}</td>
                </tr>
              ))}
              {data.models.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-center text-gray-500">{ka ? 'ხარჯის ჩანაწერები ჯერ არ არის' : 'No cost rows yet'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold">{ka ? 'ყველაზე მეტი კრედიტის მხარჯველები' : 'Top credit burners'}</h3>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead className="bg-white/[0.04] text-left text-gray-400">
              <tr>
                <th className="px-3 py-2">{ka ? 'მომხმარებელი' : 'User'}</th>
                <th className="px-3 py-2">{ka ? 'გეგმა' : 'Plan'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'დახარჯული' : 'Credits spent'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'Google ხარჯი' : 'Google cost'}</th>
                <th className="px-3 py-2 text-right">{ka ? 'მარჟა' : 'Margin'}</th>
                <th className="px-3 py-2">{ka ? 'მთავარი სერვისი' : 'Top service'}</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.userId} className="border-t border-white/[0.06]">
                  <td className="max-w-[220px] truncate px-3 py-1.5">{u.email ?? u.userId.slice(0, 8)}</td>
                  <td className="px-3 py-1.5 text-gray-300">{u.plan ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{u.creditsSpent.toLocaleString('en-US')}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">${u.googleCostUsd.toFixed(2)}</td>
                  <td className={`px-3 py-1.5 text-right tabular-nums ${marginTone(u.marginPct)}`}>{pct(u.marginPct)}</td>
                  <td className="px-3 py-1.5 text-gray-300">{u.topCapability ?? '—'}</td>
                </tr>
              ))}
              {data.users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-3 text-center text-gray-500">{ka ? 'ამ პერიოდში მოხმარება არ არის' : 'No usage in this window'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
