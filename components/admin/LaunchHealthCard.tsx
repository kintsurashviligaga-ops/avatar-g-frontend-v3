'use client';

/**
 * LaunchHealthCard — renders GET /api/health/memory as a colored ✅/❌ launch checklist inside the admin
 * Overview, so an operator never has to read raw JSON. Live-fetches on mount + on a manual refresh.
 * Booleans only (the endpoint never returns secret values); an inpaint model that isn't set reads as an
 * expected "optional / off" (amber), not a failure (red).
 */
import { useCallback, useEffect, useState } from 'react';

interface HealthResponse {
  ok: boolean;
  checks: {
    user_profile_metadata: { reachable: boolean; error?: string };
    chat_sessions_soft_delete: { reachable: boolean; error?: string };
  };
  env: Record<string, boolean>;
  note?: string;
}

type Row = { label: string; on: boolean; optional?: boolean };

export default function LaunchHealthCard({ ka }: { ka: boolean }) {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch('/api/health/memory', { credentials: 'include', cache: 'no-store' });
      if (!res.ok) { setErr(`HTTP ${res.status}`); setData(null); return; }
      setData((await res.json()) as HealthResponse);
    } catch {
      setErr(ka ? 'მოთხოვნა ვერ შესრულდა' : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [ka]);

  useEffect(() => { void load(); }, [load]);

  const schema: Row[] = data ? [
    { label: ka ? 'მეხსიერების სქემა (user_profile_metadata)' : 'Memory schema (user_profile_metadata)', on: data.checks.user_profile_metadata.reachable },
    { label: ka ? 'ურნა (chat_sessions.is_deleted)' : 'Trash (chat_sessions.is_deleted)', on: data.checks.chat_sessions_soft_delete.reachable },
  ] : [];

  const ENV_LABELS: Record<string, { label: string; optional?: boolean }> = {
    stripeSecret: { label: 'Stripe' },
    stripeWebhook: { label: ka ? 'Stripe ვებჰუკი' : 'Stripe webhook' },
    resend: { label: ka ? 'ელფოსტა (Resend)' : 'Email (Resend)' },
    replicate: { label: 'Replicate' },
    inpaintModel: { label: ka ? 'ინფეინთ მოდელი (არჩევითი)' : 'Inpaint model (optional)', optional: true },
  };
  const envRows: Row[] = data ? Object.entries(data.env).map(([k, v]) => ({
    label: ENV_LABELS[k]?.label ?? k, on: v, optional: ENV_LABELS[k]?.optional,
  })) : [];

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold text-white">{ka ? 'გაშვების მდგომარეობა' : 'Launch health'}</h3>
        <div className="flex items-center gap-2">
          {data && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${data.ok ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}>
              {data.ok ? (ka ? 'მზადაა' : 'READY') : (ka ? 'ბლოკირებულია' : 'BLOCKED')}
            </span>
          )}
          <button type="button" onClick={() => void load()} disabled={loading}
            className="rounded-lg bg-white/5 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-white/10 disabled:opacity-50">
            {loading ? '…' : (ka ? 'განახლება' : 'Refresh')}
          </button>
        </div>
      </div>

      {err && <p className="text-[12px] text-red-400">{err}</p>}
      {loading && !data && <p className="text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>}

      {data && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{ka ? 'სქემა (migration 007)' : 'Schema (migration 007)'}</p>
            {schema.map((r) => <StatusRow key={r.label} {...r} />)}
          </div>
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{ka ? 'გარემოს ცვლადები' : 'Environment keys'}</p>
            {envRows.map((r) => <StatusRow key={r.label} {...r} />)}
          </div>
          {data.note && <p className="pt-1 text-[11px] italic text-gray-500">{data.note}</p>}
        </div>
      )}
    </section>
  );
}

function StatusRow({ label, on, optional }: Row) {
  // Green when on; a required-but-off reads red, an optional-but-off reads amber ("expected off").
  const color = on ? 'text-emerald-400' : optional ? 'text-amber-400' : 'text-red-400';
  const dot = on ? 'bg-emerald-400' : optional ? 'bg-amber-400' : 'bg-red-400';
  const mark = on ? '✓' : optional ? '○' : '✕';
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-gray-300">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className={`shrink-0 text-[13px] font-bold ${color}`}>{mark}</span>
    </div>
  );
}
