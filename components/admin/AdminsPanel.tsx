'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, ShieldCheck, Lock } from 'lucide-react';

/**
 * Grant / revoke admin-panel access by email.
 *
 * ⚠️ THIS IS A UI OVER AN AUTHORISATION BOUNDARY, SO IT ASSERTS NOTHING ITSELF. Every decision is the
 * server's: /api/admin/admins is behind the same isAdmin() email allowlist as the rest of the panel, and
 * a built-in admin is refused with a 409 rather than appearing to delete. This component only renders
 * what the server says and reports what it answered.
 */

type Granted = { email: string; added_by: string; note: string | null; created_at: string };

export function AdminsPanel({ ka = true }: { ka?: boolean }) {
  const [builtIn, setBuiltIn] = useState<string[]>([]);
  const [granted, setGranted] = useState<Granted[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/admins', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { builtIn?: string[]; granted?: Granted[]; degraded?: boolean };
      setBuiltIn(j.builtIn ?? []);
      setGranted(j.granted ?? []);
      setDegraded(!!j.degraded);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grant = async () => {
    const e = email.trim().toLowerCase();
    if (!e || busy) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/admin/admins', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: e, note: note.trim() || undefined }),
      });
      const j = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) { setMsg(j.message || j.error || (ka ? 'ვერ დაემატა' : 'Could not add')); return; }
      setEmail(''); setNote(''); await load();
      setMsg(ka ? `დაემატა: ${e}` : `Added: ${e}`);
    } catch { setMsg(ka ? 'ვერ დაემატა' : 'Could not add'); }
    finally { setBusy(false); }
  };

  const revoke = async (e: string) => {
    if (busy) return;
    if (!window.confirm(ka ? `წავშალო ადმინის უფლება: ${e}?` : `Revoke admin for ${e}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/admins?email=${encodeURIComponent(e)}`, { method: 'DELETE' });
      const j = (await r.json()) as { error?: string; message?: string };
      if (!r.ok) { setMsg(j.message || j.error || (ka ? 'ვერ წაიშალა' : 'Could not revoke')); return; }
      await load();
    } catch { setMsg(ka ? 'ვერ წაიშალა' : 'Could not revoke'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      {degraded && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-300">
          {ka
            ? 'ცხრილი ჯერ არ არსებობს — გაუშვი მიგრაცია 20260802e_admin_emails.sql. ჩაშენებული ადმინები მუშაობენ.'
            : 'Table missing — run migration 20260802e_admin_emails.sql. Built-in admins still work.'}
        </p>
      )}

      {/* Grant */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email"
            placeholder={ka ? 'ელფოსტა' : 'email'}
            onKeyDown={(e) => { if (e.key === 'Enter') void grant(); }}
            className="min-h-[40px] flex-1 rounded-lg bg-white/[0.06] px-3 text-[13px] !text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-cyan-400/40"
          />
          <input
            value={note} onChange={(e) => setNote(e.target.value)} maxLength={200}
            placeholder={ka ? 'შენიშვნა (არასავალდებულო)' : 'note (optional)'}
            className="min-h-[40px] flex-1 rounded-lg bg-white/[0.06] px-3 text-[13px] !text-white outline-none ring-1 ring-white/10 placeholder:text-white/30 focus:ring-cyan-400/40"
          />
          <button type="button" onClick={() => void grant()} disabled={busy || !email.trim()}
            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg bg-cyan-500/20 px-4 text-[12.5px] font-semibold text-cyan-300 transition hover:bg-cyan-500/30 disabled:opacity-40">
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {ka ? 'დამატება' : 'Add'}
          </button>
        </div>
        {msg && <p className="mt-2 text-[12px] text-white/60">{msg}</p>}
      </div>

      {loading && <div className="flex justify-center py-6 text-white/30"><Loader2 size={18} className="animate-spin" /></div>}

      {/* Built-in — shown so it is obvious WHY they have no delete button. */}
      {!loading && builtIn.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/35">{ka ? 'ჩაშენებული (კოდი/env)' : 'Built-in (code/env)'}</p>
          <ul className="space-y-1">
            {builtIn.map((e) => (
              <li key={e} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/70">
                <Lock size={13} className="shrink-0 text-white/30" />
                <span className="truncate">{e}</span>
                <span className="ml-auto shrink-0 text-[10.5px] text-white/30">{ka ? 'ვერ წაიშლება' : 'not revocable'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Panel-granted */}
      {!loading && (
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-white/35">{ka ? 'პანელიდან მინიჭებული' : 'Granted from the panel'}</p>
          {granted.length === 0 ? (
            <p className="rounded-lg bg-white/[0.03] px-3 py-3 text-[12.5px] text-white/35">{ka ? 'ჯერ არავინ' : 'Nobody yet'}</p>
          ) : (
            <ul className="space-y-1">
              {granted.map((g) => (
                <li key={g.email} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/80">
                  <ShieldCheck size={13} className="shrink-0 text-cyan-400/70" />
                  <span className="truncate">{g.email}</span>
                  {g.note && <span className="hidden truncate text-[11px] text-white/35 sm:inline">· {g.note}</span>}
                  <span className="ml-auto hidden shrink-0 text-[10.5px] text-white/30 sm:inline">{ka ? 'დაამატა' : 'by'} {g.added_by}</span>
                  <button type="button" onClick={() => void revoke(g.email)} disabled={busy}
                    aria-label={ka ? 'წაშლა' : 'Revoke'}
                    className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white/40 transition hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-40">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminsPanel;
