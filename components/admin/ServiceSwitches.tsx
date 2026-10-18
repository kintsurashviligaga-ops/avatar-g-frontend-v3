'use client';

/**
 * ServiceSwitches — one on/off switch per studio tool (GET/POST /api/admin/services, lib/server/serviceSwitches).
 * Off means the server refuses that tool's new generations with a 503 before any charge; jobs already running finish.
 */
import { useCallback, useEffect, useState } from 'react';

interface Row { tool: string; label: { ka: string; en: string }; enabled: boolean }

export default function ServiceSwitches({ ka }: { ka: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/services', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setRows(((await res.json()) as { services: Row[] }).services);
    } catch { setErr(ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load'); }
  }, [ka]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (r: Row) => {
    const enabled = !r.enabled;
    if (!enabled && !window.confirm(ka ? `გავთიშო „${r.label.ka}“ ყველა მომხმარებლისთვის?` : `Turn "${r.label.en}" off for every user?`)) return;
    setBusy(r.tool); setErr(null);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tool: r.tool, enabled }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setRows((rs) => rs?.map((x) => (x.tool === r.tool ? { ...x, enabled } : x)) ?? rs);
    } catch { setErr(ka ? 'შენახვა ვერ მოხერხდა' : 'Save failed'); } finally { setBusy(null); }
  };

  const offCount = rows?.filter((r) => !r.enabled).length ?? 0;

  return (
    <div className="space-y-3">
      <p className="text-[12px] leading-relaxed text-gray-400">
        {ka
          ? 'გათიშული სერვისი ახალ გენერაციას აღარ იწყებს და კრედიტს არ ჭრის (ჩატიდანაც). უკვე დაწყებული სამუშაო სრულდება. ცვლილება ყველა სერვერზე ~30 წამში ვრცელდება.'
          : 'A switched-off service starts no new generation and charges nothing (chat included). Jobs already running finish. Takes effect on every server within ~30 s.'}
      </p>
      {err && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{err}</p>}
      {offCount > 0 && <p className="text-[12px] text-amber-400">{ka ? `გათიშულია: ${offCount}` : `Switched off: ${offCount}`}</p>}
      {!rows ? (
        <p className="py-6 text-center text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.tool} className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${r.enabled ? 'border-white/10 bg-white/[0.03]' : 'border-rose-500/25 bg-rose-500/[0.05]'}`}>
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-gray-100">{ka ? r.label.ka : r.label.en}</p>
                <p className={`text-[11px] ${r.enabled ? 'text-emerald-400/80' : 'text-rose-300'}`}>{r.enabled ? (ka ? 'ჩართულია' : 'On') : (ka ? 'გათიშულია' : 'Off')}</p>
              </div>
              <button
                role="switch" aria-checked={r.enabled} aria-label={ka ? r.label.ka : r.label.en}
                disabled={busy === r.tool} onClick={() => void toggle(r)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${r.enabled ? 'bg-emerald-500/70' : 'bg-white/15'}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${r.enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
