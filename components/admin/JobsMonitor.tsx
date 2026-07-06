'use client';

/**
 * JobsMonitor — the Master Control task/queue deck (v358 #4). Polls the live queue (pending + processing) and
 * recent failures every 10s. Kill marks a stuck job failed (advisory DB-state op — it does not abort a live
 * provider render, which self-corrects on finish; no refund). Retry resets a failed job to pending. Both go
 * through the admin-gated /api/admin/jobs routes.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface Job { id: string; user_id: string | null; service_type: string; status: string; current_stage: string | null; pct: number; error: string | null; created_at: string; updated_at: string | null }

function age(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default function JobsMonitor({ ka }: { ka: boolean }) {
  const [active, setActive] = useState<Job[]>([]);
  const [failed, setFailed] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/admin/jobs', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { active?: Job[]; recentFailed?: Job[] };
      setActive(j.active ?? []); setFailed(j.recentFailed ?? []); setErr(null);
    } catch {
      setErr(ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load');
    } finally { if (!silent) setLoading(false); }
  }, [ka]);

  useEffect(() => {
    void load();
    timer.current = setInterval(() => void load(true), 10_000);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [load]);

  const act = useCallback(async (id: string, kind: 'cancel' | 'retry') => {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/jobs/${encodeURIComponent(id)}/${kind}`, { method: 'POST' });
      if (!res.ok) throw new Error(String(res.status));
      await load(true);
    } catch {
      setErr(ka ? 'მოქმედება ვერ შესრულდა' : 'Action failed');
    } finally { setBusy(null); }
  }, [load, ka]);

  return (
    <div className="space-y-5">
      {err && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{err}</p>}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'აქტიური რიგი' : 'Active queue'} <span className="text-gray-600">{active.length}</span></h2>
          <span className="text-[10px] text-gray-600">{ka ? 'ავტ. განახლება 10წმ' : 'auto-refresh 10s'}</span>
        </div>
        {loading ? (
          <p className="py-6 text-center text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>
        ) : active.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-emerald-400/80">{ka ? 'რიგი ცარიელია — მიმდინარე რენდერი არ არის' : 'Queue is empty — nothing rendering'}</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {active.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 py-2.5 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-gray-300">{j.service_type}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${j.status === 'processing' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-amber-500/15 text-amber-400'}`}>{j.status}</span>
                    <span className="tabular-nums text-gray-500">{j.pct}%</span>
                    <span className="truncate text-gray-500">{j.current_stage ?? ''}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-gray-600">{j.id} · {age(j.created_at)}</p>
                </div>
                <button disabled={busy === j.id} onClick={() => act(j.id, 'cancel')}
                  className="shrink-0 rounded-md border border-rose-500/25 bg-rose-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-rose-300 hover:bg-rose-500/15 disabled:opacity-50">
                  {busy === j.id ? '…' : (ka ? 'შეწყვეტა' : 'Kill')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10.5px] leading-relaxed text-gray-600">{ka ? 'შეწყვეტა მონიშნავს დავალებას როგორც ვერ შესრულებული (მიმდინარე რენდერი შესაძლოა მაინც დასრულდეს). კრედიტი არ ბრუნდება.' : 'Kill marks the job failed (a live render may still finish and self-correct). No credit refund (forfeit).'}</p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'ბოლო წარუმატებლები' : 'Recent failures'} <span className="text-gray-600">{failed.length}</span></h2>
        {failed.length === 0 ? (
          <p className="py-3 text-center text-[12px] text-gray-600">—</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {failed.map((j) => (
              <li key={j.id} className="flex items-center justify-between gap-3 py-2.5 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-300">{j.service_type}</span>
                    <span className="truncate text-gray-500">{j.error ?? 'failed'}</span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[10px] text-gray-600">{j.id} · {age(j.created_at)}</p>
                </div>
                <button disabled={busy === j.id} onClick={() => act(j.id, 'retry')}
                  className="shrink-0 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-white/5 disabled:opacity-50">
                  {busy === j.id ? '…' : (ka ? 'გადატვირთვა' : 'Retry')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
