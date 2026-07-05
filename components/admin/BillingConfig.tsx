'use client';

/**
 * BillingConfig — the Master Control billing tab (v358 #2): edit purchasable refill tiers (GEL), view/edit
 * the METRIC-ONLY commission rules (stored + displayed, never deducted), and increment/decrement a user's
 * credits by email. All data + writes go through the admin-gated /api/admin/billing/config and
 * /api/admin/credits/adjust routes; this component only renders + calls them.
 */
import { useCallback, useEffect, useState } from 'react';

interface Tier { gelAmount: number; creditsAmount: number; label: string | null; isActive: boolean }
interface TierConfig { configured: Tier[]; effective: Tier[]; usingDefaults: boolean; defaults: Tier[] }
interface Commission { gateway: 'stripe' | 'bog'; commissionPercent: number; note: string | null }

export default function BillingConfig({ ka }: { ka: boolean }) {
  const [tiers, setTiers] = useState<TierConfig | null>(null);
  const [commission, setCommission] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // tier form
  const [tGel, setTGel] = useState('');
  const [tLabel, setTLabel] = useState('');
  // credit adjust form
  const [email, setEmail] = useState('');
  const [amt, setAmt] = useState('');
  const [adjustMsg, setAdjustMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/admin/billing/config', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as { tiers?: TierConfig; commission?: Commission[] };
      setTiers(j.tiers ?? null); setCommission(j.commission ?? []);
    } catch {
      setErr(ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load');
    } finally { setLoading(false); }
  }, [ka]);

  useEffect(() => { void load(); }, [load]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/billing/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const j = (await res.json().catch(() => ({}))) as { error?: string }; throw new Error(j.error ?? String(res.status)); }
  }, []);

  const saveTier = useCallback(async (t: { gelAmount: number; creditsAmount?: number; label?: string | null; isActive?: boolean }) => {
    setBusy(true); setErr(null);
    try { await post({ kind: 'tier', ...t }); await load(); }
    catch (e) { setErr((ka ? 'შენახვა ვერ მოხერხდა: ' : 'Save failed: ') + (e instanceof Error ? e.message : '')); }
    finally { setBusy(false); }
  }, [post, load, ka]);

  const addTier = useCallback(() => {
    const gel = Number(tGel);
    if (!Number.isFinite(gel) || gel <= 0) { setErr(ka ? 'არასწორი თანხა' : 'Invalid amount'); return; }
    void saveTier({ gelAmount: gel, label: tLabel || null, isActive: true });
    setTGel(''); setTLabel('');
  }, [tGel, tLabel, saveTier, ka]);

  const saveCommission = useCallback(async (gateway: 'stripe' | 'bog', pct: number) => {
    setBusy(true); setErr(null);
    try { await post({ kind: 'commission', gateway, commissionPercent: pct }); await load(); }
    catch (e) { setErr((ka ? 'შენახვა ვერ მოხერხდა: ' : 'Save failed: ') + (e instanceof Error ? e.message : '')); }
    finally { setBusy(false); }
  }, [post, load, ka]);

  const adjust = useCallback(async () => {
    const a = Math.trunc(Number(amt));
    if (!email.trim() || !Number.isFinite(a) || a === 0) { setAdjustMsg({ ok: false, text: ka ? 'შეავსეთ ელფოსტა და თანხა' : 'Enter email and a non-zero amount' }); return; }
    setBusy(true); setAdjustMsg(null);
    try {
      const res = await fetch('/api/admin/credits/adjust', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email.trim(), amount: a }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; newBalance?: number; error?: string };
      if (!res.ok || !j.ok) { setAdjustMsg({ ok: false, text: j.error ?? (ka ? 'შეცდომა' : 'Error') }); return; }
      setAdjustMsg({ ok: true, text: `${ka ? 'ახალი ბალანსი' : 'New balance'}: ${j.newBalance}` });
      setAmt('');
    } catch {
      setAdjustMsg({ ok: false, text: ka ? 'ქსელის შეცდომა' : 'Network error' });
    } finally { setBusy(false); }
  }, [email, amt, ka]);

  const input = 'rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder:text-gray-600 focus:border-cyan-500/40 focus:outline-none';

  if (loading) return <p className="py-8 text-center text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>;

  return (
    <div className="space-y-5">
      {err && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{err}</p>}

      {/* ── Refill tiers ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'შევსების ტარიფები (₾)' : 'Refill tiers (₾)'}</h2>
          {tiers?.usingDefaults && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-400">{ka ? 'ნაგულისხმევი' : 'defaults'}</span>}
        </div>
        <ul className="divide-y divide-white/[0.06]">
          {(tiers?.effective ?? []).map((t) => (
            <li key={t.gelAmount} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
              <span className="font-semibold tabular-nums text-white">{t.gelAmount} ₾</span>
              <span className="flex-1 truncate text-gray-500">{t.label || ''}</span>
              {!tiers?.usingDefaults && (
                <button disabled={busy} onClick={() => saveTier({ gelAmount: t.gelAmount, creditsAmount: t.creditsAmount, label: t.label, isActive: !t.isActive })}
                  className={`rounded-md px-2 py-1 text-[11px] ${t.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-gray-400'} disabled:opacity-50`}>
                  {t.isActive ? (ka ? 'აქტიური' : 'active') : (ka ? 'გამორთ.' : 'off')}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.06] pt-3">
          <input value={tGel} onChange={(e) => setTGel(e.target.value)} type="number" min={1} placeholder="₾" className={`w-24 ${input}`} aria-label={ka ? 'თანხა ₾' : 'GEL amount'} />
          <input value={tLabel} onChange={(e) => setTLabel(e.target.value)} placeholder={ka ? 'იარლიყი (არასავალდ.)' : 'label (optional)'} className={`flex-1 ${input}`} aria-label={ka ? 'იარლიყი' : 'label'} />
          <button disabled={busy} onClick={addTier} className="rounded-lg bg-cyan-500/90 px-3 py-2 text-[12px] font-semibold text-[#06060d] hover:bg-cyan-400 disabled:opacity-50">{ka ? 'დამატება' : 'Add / update'}</button>
        </div>
        <p className="mt-2 text-[10.5px] text-gray-600">{ka ? 'ტარიფი აკონტროლებს რომელი ₾ თანხის შეძენაა შესაძლებელი. ცვლილება მოქმედებს ~30წმ-ში.' : 'A tier controls which ₾ amounts are purchasable. Changes apply within ~30s.'}</p>
      </section>

      {/* ── Commission (metric-only) ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'საკომისიო წესები' : 'Commission rules'}</h2>
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-400">{ka ? 'მხოლოდ მეტრიკა' : 'metric only'}</span>
        </div>
        <p className="mb-3 text-[10.5px] text-gray-600">{ka ? 'ინახება ანგარიშგებისთვის — არასდროს აკლდება შევსებას.' : 'Stored for reporting — never deducted from a top-up.'}</p>
        {(['stripe', 'bog'] as const).map((gw) => {
          const rule = commission.find((c) => c.gateway === gw);
          return <CommissionRow key={gw} ka={ka} gateway={gw} pct={rule?.commissionPercent ?? 0} busy={busy} onSave={saveCommission} />;
        })}
      </section>

      {/* ── Credit adjust by email ── */}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'კრედიტის კორექცია (ელფოსტით)' : 'Adjust credits by email'}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="user@email.com" className={`flex-1 ${input}`} aria-label="email" />
          <input value={amt} onChange={(e) => setAmt(e.target.value)} type="number" placeholder="±credits" className={`w-28 ${input}`} aria-label={ka ? 'თანხა' : 'amount'} />
          <button disabled={busy} onClick={adjust} className="rounded-lg bg-cyan-500/90 px-3 py-2 text-[12px] font-semibold text-[#06060d] hover:bg-cyan-400 disabled:opacity-50">{ka ? 'გამოყენება' : 'Apply'}</button>
        </div>
        {adjustMsg && <p className={`mt-2 text-[12px] ${adjustMsg.ok ? 'text-emerald-400' : 'text-rose-400'}`}>{adjustMsg.text}</p>}
        <p className="mt-2 text-[10.5px] text-gray-600">{ka ? 'უარყოფითი ამცირებს; ბალანსი ნულს ქვემოთ არ ჩამოვა.' : 'Negative decrements; a balance can never go below zero.'}</p>
      </section>
    </div>
  );
}

function CommissionRow({ ka, gateway, pct, busy, onSave }: { ka: boolean; gateway: 'stripe' | 'bog'; pct: number; busy: boolean; onSave: (g: 'stripe' | 'bog', p: number) => void }) {
  const [v, setV] = useState(String(pct));
  useEffect(() => { setV(String(pct)); }, [pct]);
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="w-16 text-[12.5px] font-medium capitalize text-gray-200">{gateway}</span>
      <div className="flex items-center gap-2">
        <input value={v} onChange={(e) => setV(e.target.value)} type="number" min={0} max={100} step={0.1}
          className="w-20 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-right text-[12px] text-white focus:border-cyan-500/40 focus:outline-none" aria-label={`${gateway} %`} />
        <span className="text-[12px] text-gray-500">%</span>
        <button disabled={busy} onClick={() => onSave(gateway, Number(v))} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-gray-300 hover:bg-white/5 disabled:opacity-50">{ka ? 'შენახვა' : 'Save'}</button>
      </div>
    </div>
  );
}
