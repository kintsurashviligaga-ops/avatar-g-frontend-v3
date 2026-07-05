'use client';

/**
 * FeatureFlags — the Master Control feature-flags tab (v358 #3). Lists the runtime-togglable gates with an
 * env/db/default provenance badge + a switch, and read-only readiness for the 6 core agents. A flag pinned
 * in Vercel env is shown as `env` and its switch is disabled (the DB cannot override a pinned env value).
 * All data + writes go through the admin-gated /api/admin/flags route; this component only renders + calls it.
 */
import { useCallback, useEffect, useState } from 'react';

interface ResolvedFlag {
  name: string; label: string; description: string; default: boolean;
  envRaw: string | null; envResolved: boolean | null; dbEnabled: boolean | null;
  effective: boolean; source: 'env' | 'db' | 'default';
}
interface Provider { key: string; label: string; ready: boolean }

export default function FeatureFlags({ ka }: { ka: boolean }) {
  const [flags, setFlags] = useState<ResolvedFlag[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/admin/flags', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { flags?: ResolvedFlag[]; providers?: Provider[] };
      setFlags(j.flags ?? []); setProviders(j.providers ?? []);
    } catch {
      setErr(ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load');
    } finally { setLoading(false); }
  }, [ka]);

  useEffect(() => { void load(); }, [load]);

  const toggle = useCallback(async (f: ResolvedFlag) => {
    if (f.source === 'env' || busy) return; // env-pinned → cannot override
    const next = !f.effective;
    setBusy(f.name); setErr(null);
    setFlags((prev) => prev.map((x) => (x.name === f.name ? { ...x, effective: next, dbEnabled: next, source: 'db' } : x)));
    try {
      const res = await fetch('/api/admin/flags', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag: f.name, enabled: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setErr(ka ? 'შენახვა ვერ მოხერხდა' : 'Save failed');
      void load(); // revert to server truth
    } finally { setBusy(null); }
  }, [busy, load, ka]);

  return (
    <div className="space-y-5">
      {err && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{err}</p>}

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'გადამრთველები' : 'Runtime toggles'}</h2>
          <span className="text-[10px] text-gray-600">{ka ? 'ცვლილება ~30წმ-ში ვრცელდება' : 'changes apply within ~30s'}</span>
        </div>
        {loading ? (
          <p className="py-6 text-center text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>
        ) : flags.length === 0 ? (
          <p className="py-6 text-center text-[12px] text-gray-600">—</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {flags.map((f) => {
              const pinned = f.source === 'env';
              return (
                <li key={f.name} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-white">{f.label}</p>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${f.source === 'env' ? 'bg-amber-500/15 text-amber-400' : f.source === 'db' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-white/10 text-gray-400'}`}>
                        {f.source === 'env' ? (ka ? 'ENV ფიქს.' : 'env pinned') : f.source === 'db' ? (ka ? 'ბაზა' : 'db') : (ka ? 'ნაგულისხმევი' : 'default')}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{f.description}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-gray-600">{f.name}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={f.effective}
                    aria-label={f.label}
                    disabled={pinned || busy === f.name}
                    onClick={() => toggle(f)}
                    title={pinned ? (ka ? 'დაფიქსირებულია env-ში' : 'Pinned in env — clear the env var to override') : undefined}
                    className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors ${f.effective ? 'bg-emerald-500/80' : 'bg-white/15'} ${pinned ? 'cursor-not-allowed opacity-50' : 'hover:opacity-90'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${f.effective ? 'left-[22px]' : 'left-0.5'}`} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'აგენტების მზადყოფნა' : 'Agent readiness'} <span className="text-gray-600">{ka ? '(მხოლოდ ჩვენება)' : '(read-only)'}</span></h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {providers.map((p) => (
            <div key={p.key} className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
              <span className="truncate text-[12px] text-gray-300">{p.label}</span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.ready ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'}`}>
                {p.ready ? (ka ? 'გასაღები ✓' : 'key ✓') : (ka ? 'გასაღები არ არის' : 'no key')}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
