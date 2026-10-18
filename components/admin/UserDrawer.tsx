'use client';

/**
 * UserDrawer — one customer's account, opened from the Users tab (GET /api/admin/users/[id], lib/admin/userDetail).
 * Balance add / deduct with a note, a credit refund per spend, plan assignment (optionally with the plan's monthly
 * credits), and the full ledger and payment history. Every write goes through the credit ledger, so the balance,
 * the user's own history and the dashboard all agree.
 *
 * Card refunds are not here: giving money back on a card is a BOG action and stays the owner's call.
 */
import { useCallback, useEffect, useState } from 'react';
import { TIER_IDS, TIERS, type TierId } from '@/lib/billing/tiers';
import type { AdminUserDetail } from '@/lib/admin/userDetail';

type Msg = { ok: boolean; text: string } | null;

const ERRORS_KA: Record<string, string> = {
  insufficient_balance: 'ბალანსი არ ყოფნის',
  invalid_amount: 'არასწორი რაოდენობა',
  already_refunded: 'უკვე დაბრუნებულია',
  not_refundable: 'ამ ჩანაწერის დაბრუნება არ შეიძლება',
  not_found: 'ჩანაწერი ვერ მოიძებნა',
  user_not_found: 'მომხმარებელი ვერ მოიძებნა',
  preview_not_isolated: 'ამ გარემოში ჩაწერა დაბლოკილია',
};

export default function UserDrawer({ ka, userId, onClose, onBalance, fmt }: {
  ka: boolean;
  userId: string;
  onClose: () => void;
  onBalance: (id: string, balance: number) => void;
  fmt: (iso: string) => string;
}) {
  const [d, setD] = useState<AdminUserDetail | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [tier, setTier] = useState<TierId>('free');
  const [grantAllowance, setGrantAllowance] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = (await res.json()) as AdminUserDetail;
      setD(j); setTier(j.tier);
    } catch { setLoadErr(true); }
  }, [userId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const errText = (code?: string) => (ka ? ERRORS_KA[code ?? ''] ?? code ?? 'შეცდომა' : code ?? 'Error');

  const post = async (key: string, path: string, body: unknown, ok: (j: { newBalance?: number | null; granted?: number }) => string) => {
    setBusy(key); setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; newBalance?: number | null; granted?: number };
      if (!res.ok || !j.ok) { setMsg({ ok: false, text: errText(j.error) }); return; }
      if (typeof j.newBalance === 'number') onBalance(userId, j.newBalance);
      setMsg({ ok: true, text: ok(j) });
      await load();
    } catch { setMsg({ ok: false, text: ka ? 'ქსელის შეცდომა' : 'Network error' }); } finally { setBusy(null); }
  };

  const adjust = (sign: 1 | -1) => {
    const n = Math.floor(Number(amount));
    if (!Number.isFinite(n) || n <= 0) { setMsg({ ok: false, text: ka ? 'არასწორი რაოდენობა' : 'Invalid amount' }); return; }
    if (sign < 0 && !window.confirm(ka ? `ჩამოვჭრა ${n} კრედიტი?` : `Deduct ${n} credits?`)) return;
    void post(sign > 0 ? 'add' : 'take', 'credits', { delta: sign * n, note: note.trim() || undefined }, () => {
      setAmount(''); setNote('');
      return `${sign > 0 ? '+' : '−'}${n} ✓`;
    });
  };

  const refund = (ledgerId: string, credits: number) => {
    if (!window.confirm(ka ? `დავუბრუნო ${credits} კრედიტი?` : `Refund ${credits} credits?`)) return;
    void post(`refund:${ledgerId}`, 'refund', { ledgerId }, () => `+${credits} ✓`);
  };

  const assign = () => {
    const name = ka ? TIERS[tier].names.ka : TIERS[tier].names.en;
    if (!window.confirm(ka ? `მივანიჭო პაკეტი „${name}“?` : `Assign the "${name}" plan?`)) return;
    void post('plan', 'plan', { tier, grantAllowance }, (j) => (j.granted ? `${name} ✓ +${j.granted}` : `${name} ✓`));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        role="dialog" aria-modal="true" aria-label={ka ? 'მომხმარებელი' : 'User'}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0D1016] p-5 text-white"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{d?.email ?? '…'}</p>
            <p className="truncate text-[11.5px] text-gray-500">
              {d?.fullName ? `${d.fullName} · ` : ''}{userId.slice(0, 8)}…{d?.createdAt ? ` · ${fmt(d.createdAt)}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label={ka ? 'დახურვა' : 'Close'} className="rounded-lg px-2 py-1 text-[15px] text-gray-400 hover:bg-white/5 hover:text-white">✕</button>
        </div>

        {loadErr && <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load'}</p>}

        {d && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{ka ? 'ბალანსი' : 'Balance'}</p>
                <p className="mt-1 text-[20px] font-bold tabular-nums text-cyan-400">{d.balance}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{ka ? 'პაკეტი' : 'Plan'}</p>
                <p className="mt-1 text-[15px] font-semibold">{ka ? TIERS[d.tier].names.ka : TIERS[d.tier].names.en}</p>
                <p className="text-[10px] text-gray-500">{d.tierSource === 'subscription' ? (ka ? 'გამოწერა' : 'subscription') : d.tierSource === 'comp' ? (ka ? 'ადმინის მინიჭებული' : 'admin comp') : (ka ? 'ნაგულისხმევი' : 'default')}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wide text-gray-500">{ka ? 'გენერაცია' : 'Generations'}</p>
                <p className="mt-1 text-[20px] font-bold tabular-nums">{d.generations ?? '—'}</p>
              </div>
            </div>

            {msg && <p className={`rounded-lg px-3 py-2 text-[12px] ${msg.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'}`}>{msg.text}</p>}

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'ბალანსის მართვა' : 'Balance'}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={ka ? 'კრედიტი' : 'Credits'}
                  className="w-24 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1.5 text-[12.5px] focus:border-cyan-500/50 focus:outline-none" />
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder={ka ? 'შენიშვნა (არასავალდებულო)' : 'Note (optional)'}
                  className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/[0.06] px-2 py-1.5 text-[12.5px] focus:border-cyan-500/50 focus:outline-none" />
                <button disabled={!!busy} onClick={() => adjust(1)} className="rounded-md bg-emerald-500/20 px-3 py-1.5 text-[12px] font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50">
                  {busy === 'add' ? '…' : (ka ? '+ ჩარიცხვა' : '+ Add')}
                </button>
                <button disabled={!!busy} onClick={() => adjust(-1)} className="rounded-md bg-rose-500/20 px-3 py-1.5 text-[12px] font-medium text-rose-300 hover:bg-rose-500/30 disabled:opacity-50">
                  {busy === 'take' ? '…' : (ka ? '− ჩამოჭრა' : '− Deduct')}
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'პაკეტის მინიჭება' : 'Assign plan'}</h3>
              <div className="flex flex-wrap items-center gap-2">
                <select value={tier} onChange={(e) => setTier(e.target.value as TierId)}
                  className="rounded-md border border-white/15 bg-[#151922] px-2 py-1.5 text-[12.5px] focus:outline-none">
                  {TIER_IDS.map((t) => <option key={t} value={t}>{ka ? TIERS[t].names.ka : TIERS[t].names.en}</option>)}
                </select>
                {tier !== 'free' && (
                  <label className="flex items-center gap-1.5 text-[12px] text-gray-300">
                    <input type="checkbox" checked={grantAllowance} onChange={(e) => setGrantAllowance(e.target.checked)} />
                    {ka ? 'თვის კრედიტებიც ჩაერიცხოს' : 'Also grant the monthly credits'}
                  </label>
                )}
                <button disabled={!!busy} onClick={assign} className="ml-auto rounded-md bg-cyan-500/20 px-3 py-1.5 text-[12px] font-medium text-cyan-300 hover:bg-cyan-500/30 disabled:opacity-50">
                  {busy === 'plan' ? '…' : (ka ? 'მინიჭება' : 'Assign')}
                </button>
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'გადახდები' : 'Payments'} <span className="text-gray-600">{d.payments.length}</span></h3>
              {d.payments.length === 0 ? <p className="py-2 text-[12px] text-gray-600">—</p> : (
                <ul className="divide-y divide-white/[0.06]">
                  {d.payments.map((p) => (
                    <li key={`${p.rail}:${p.id}`} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                      <span className="w-16 shrink-0 rounded bg-white/[0.06] px-1.5 py-0.5 text-center text-[10px] text-gray-300">{p.rail === 'bog' ? 'BOG' : (ka ? 'საფულე' : 'Wallet')}</span>
                      <span className="flex-1 truncate text-gray-400">{p.kind} · {p.status}{p.credits !== null ? ` · ${p.credits} ${ka ? 'კრ.' : 'cr'}` : ''}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-emerald-300">{p.amountGel} ₾</span>
                      <span className="shrink-0 text-gray-500">{fmt(p.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[10.5px] text-gray-600">{ka ? 'ბარათზე თანხის დაბრუნება BOG-ის მხრიდან ხდება და მფლობელის გადაწყვეტილებაა.' : 'Card refunds happen on the BOG side and are the owner\'s call.'}</p>
            </section>

            <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'ტრანზაქციები' : 'Transactions'} <span className="text-gray-600">{d.ledger.length}</span></h3>
              {d.ledger.length === 0 ? <p className="py-2 text-[12px] text-gray-600">—</p> : (
                <ul className="divide-y divide-white/[0.06]">
                  {d.ledger.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-[12px]">
                      <span className={`w-14 shrink-0 text-right font-semibold tabular-nums ${l.delta >= 0 ? 'text-emerald-400' : 'text-rose-300'}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</span>
                      <span className="w-20 shrink-0 truncate text-gray-300">{l.action}</span>
                      <span className="flex-1 truncate font-mono text-[10.5px] text-gray-600" title={l.ref}>{l.ref || l.reason}</span>
                      <span className="shrink-0 text-gray-500">{fmt(l.createdAt)}</span>
                      {l.refundable ? (
                        <button disabled={!!busy} onClick={() => refund(l.id, -l.delta)}
                          className="shrink-0 rounded-md border border-white/10 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-white/5 disabled:opacity-50">
                          {busy === `refund:${l.id}` ? '…' : (ka ? 'დაბრუნება' : 'Refund')}
                        </button>
                      ) : l.refunded ? (
                        <span className="shrink-0 text-[10.5px] text-emerald-400/70">{ka ? 'დაბრუნდა' : 'refunded'}</span>
                      ) : <span className="w-[58px] shrink-0" />}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </aside>
    </div>
  );
}
