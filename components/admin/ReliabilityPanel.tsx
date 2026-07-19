'use client';

/**
 * ReliabilityPanel — the "measure first" admin tab. Fetches GET /api/admin/reliability and shows, at a
 * glance: which provider keys are LIVE in this deployment, per-service success rates + real render
 * timings, active warnings, and recent failures — so product decisions rest on facts. Fully self-
 * contained + fail-open (a fetch miss shows an honest error, never a blank crash).
 */
import { useEffect, useState, useCallback } from 'react';

interface ServiceStat {
  service: string; total: number; completed: number; failed: number; inFlight: number;
  successRate: number | null; avgDurationSec: number | null;
}
interface Snapshot {
  ok: boolean;
  scenePlanningLive: boolean;
  providers: Record<string, boolean>;
  videoModel: string;
  runwayModel: string;
  reliability: { windowDays: number; totals: { total: number; completed: number; failed: number; inFlight: number; successRate: number | null }; perService: ServiceStat[]; recentFailures: { service: string; at: string }[] };
  financials: { grossRevenueGel: number; apiRawCostGel: number; netMarginGel: number; netMarginPct: number | null; topupCount: number; packageDistribution: { tier: string; count: number; totalGel: number }[] };
  warnings: string[];
}

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`);
const gel = (n: number) => `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} ₾`;
const rateClass = (r: number | null) => (r === null ? 'text-gray-400' : r >= 0.9 ? 'text-emerald-400' : r >= 0.7 ? 'text-amber-400' : 'text-rose-400');
const dur = (s: number | null) => (s === null ? '—' : s >= 60 ? `${(s / 60).toFixed(1)}m` : `${Math.round(s)}s`);

export default function ReliabilityPanel({ ka }: { ka: boolean }) {
  const [days, setDays] = useState(7);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (d: number) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/reliability?days=${d}`, { credentials: 'include', cache: 'no-store' });
      const j = (await res.json().catch(() => null)) as Snapshot | { error?: string } | null;
      if (!res.ok || !j || !('ok' in j) || !j.ok) { setErr((j as { error?: string })?.error || `HTTP ${res.status}`); setSnap(null); }
      else setSnap(j as Snapshot);
    } catch (e) { setErr(e instanceof Error ? e.message : 'failed'); setSnap(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-white">{ka ? 'სანდოობა & ჯანმრთელობა' : 'Reliability & Health'}</h2>
        <div className="flex items-center gap-1.5">
          {[1, 7, 30].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${days === d ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}>
              {d === 1 ? '24h' : `${d}d`}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-[13px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>}
      {err && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12.5px] text-rose-400 ring-1 ring-rose-500/20">{err}</p>}

      {snap && (
        <>
          {/* Scene-planning liveness — the decisive "is generation degraded?" signal. */}
          <div className={`rounded-xl px-4 py-3 ring-1 ${snap.scenePlanningLive ? 'bg-emerald-500/10 ring-emerald-500/20' : 'bg-rose-500/10 ring-rose-500/20'}`}>
            <p className={`text-[13px] font-semibold ${snap.scenePlanningLive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {snap.scenePlanningLive ? (ka ? '🟢 სცენების დაგეგმვა ცოცხალია' : '🟢 Scene planning LIVE') : (ka ? '🔴 არცერთი LLM key არ არის მიბმული — გენერაცია დეგრადირდება' : '🔴 No LLM key bound — generation degrades')}
            </p>
          </div>

          {/* Provider key presence chips */}
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(snap.providers).map(([name, live]) => (
              <span key={name} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium ring-1 ${live ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20' : 'bg-white/5 text-gray-500 ring-white/10'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-gray-600'}`} />{name}
              </span>
            ))}
          </div>

          {/* Warnings */}
          {snap.warnings.length > 0 && (
            <ul className="space-y-1.5">
              {snap.warnings.map((w, i) => (
                <li key={i} className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12.5px] text-amber-300 ring-1 ring-amber-500/20">⚠ {w}</li>
              ))}
            </ul>
          )}

          {/* TRACK 4 — Financial Analytics & Subscription Tiers */}
          <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-white/10">
            <div className="mb-3 flex items-baseline justify-between">
              <h3 className="text-[13px] font-semibold text-white">{ka ? 'ფინანსური ანალიტიკა' : 'Financial Analytics'}</h3>
              <span className="text-[11px] text-gray-500">{ka ? `${snap.financials.topupCount} გადახდა` : `${snap.financials.topupCount} top-ups`} · {snap.reliability.windowDays}d</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{ka ? 'შემოსავალი' : 'Gross revenue'}</p>
                <p className="mt-0.5 text-[19px] font-bold tabular-nums text-emerald-400">{gel(snap.financials.grossRevenueGel)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{ka ? 'პროვაიდერის ხარჯი' : 'Provider cost'}</p>
                <p className="mt-0.5 text-[19px] font-bold tabular-nums text-amber-400">{gel(snap.financials.apiRawCostGel)}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{ka ? 'წმინდა მარჟა' : 'Net margin'}</p>
                <p className={`mt-0.5 text-[19px] font-bold tabular-nums ${snap.financials.netMarginGel >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {gel(snap.financials.netMarginGel)}{snap.financials.netMarginPct !== null && <span className="ml-1 text-[12px] text-gray-500">({Math.round(snap.financials.netMarginPct * 100)}%)</span>}
                </p>
              </div>
            </div>
            {snap.financials.packageDistribution.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-white/5 pt-3">
                {snap.financials.packageDistribution.map((b) => (
                  <span key={b.tier} className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[11.5px] text-gray-300 ring-1 ring-white/10">
                    {b.tier}: <span className="font-semibold tabular-nums text-white">{b.count}</span> <span className="text-gray-500">({gel(b.totalGel)})</span>
                  </span>
                ))}
              </div>
            )}
            <p className="mt-2 text-[10px] text-gray-600">{ka ? 'ხარჯი — რეალური wholesale (agent_evolution_traces), არა შეფასება.' : 'Cost = real wholesale from traces, not an estimate.'}</p>
          </div>

          {/* Per-service success rate + timings (Product-Ad / Face-Swap / Motion appear as their own labels) */}
          <div className="overflow-x-auto rounded-xl ring-1 ring-white/10">
            <table className="w-full min-w-[520px] text-[12.5px]">
              <thead>
                <tr className="border-b border-white/10 text-left text-gray-400">
                  <th className="px-3 py-2 font-medium">{ka ? 'სერვისი' : 'Service'}</th>
                  <th className="px-3 py-2 text-right font-medium">{ka ? 'სულ' : 'Total'}</th>
                  <th className="px-3 py-2 text-right font-medium">{ka ? 'წარმატება' : 'Success'}</th>
                  <th className="px-3 py-2 text-right font-medium">{ka ? 'ჩავარდნა' : 'Failed'}</th>
                  <th className="px-3 py-2 text-right font-medium">{ka ? 'მიმდინარე' : 'In-flight'}</th>
                  <th className="px-3 py-2 text-right font-medium">{ka ? 'საშ. დრო' : 'Avg time'}</th>
                </tr>
              </thead>
              <tbody className="text-gray-200">
                {snap.reliability.perService.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-500">{ka ? 'ამ ფანჯარაში მონაცემი არ არის' : 'No jobs in this window'}</td></tr>
                )}
                {snap.reliability.perService.map((s) => (
                  <tr key={s.service} className="border-b border-white/5 last:border-0">
                    <td className="px-3 py-2 font-medium capitalize">{s.service}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.total}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${rateClass(s.successRate)}`}>{pct(s.successRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-400/90">{s.failed}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">{s.inFlight}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{dur(s.avgDurationSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-gray-600">
            {ka ? 'ვიდეო მოდელი' : 'Video model'}: <span className="text-gray-400">{snap.videoModel}</span> · Runway: <span className="text-gray-400">{snap.runwayModel}</span> · {ka ? 'ფანჯარა' : 'window'}: {snap.reliability.windowDays}d
          </p>
        </>
      )}
    </div>
  );
}
