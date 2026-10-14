'use client';

/**
 * BogReadiness — the Bank of Georgia card on the admin billing tab. Shows what this deployment is configured with
 * (GET /api/admin/billing/bog) and has one button that asks BOG whether it accepts our credentials
 * (POST { action: 'oauth' }: a token request — no order, no money). Built so the owner can see why checkout ends in
 * `init_failed` without starting a payment.
 */
import { useCallback, useEffect, useState } from 'react';

interface Readiness {
  configured: boolean;
  environment: 'production' | 'sandbox' | null;
  clientIdTail: string | null;
  callbackKey: string | null;
  callbackUrl: string;
  schemaReady: boolean;
  cronSecretSet: boolean;
  checkoutMode?: 'off' | 'admin' | 'public';
  limitsGel?: { singleTransaction: number; per24h: number; per30d: number };
  paidGel?: { last24h: number; last30d: number; capped?: boolean };
  sandboxBlocked?: boolean;
  ordersByStatus: Record<string, number>;
  recentOrders: Array<{ kind: string; status: string; amountGel: number; createdAt: string; rejectReason: string | null }>;
}
interface Probe { verdict: string; environment: string | null; httpStatus: number; answer: string | null; hint: string; tookMs: number }

export default function BogReadiness({ ka }: { ka: boolean }) {
  const [r, setR] = useState<Readiness | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [probe, setProbe] = useState<Probe | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch('/api/admin/billing/bog', { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      setR(((await res.json()) as { bog: Readiness }).bog);
    } catch {
      setErr(ka ? 'BOG-ის მდგომარეობა ვერ ჩაიტვირთა' : 'Could not load BOG status');
    }
  }, [ka]);
  useEffect(() => { void load(); }, [load]);

  const runProbe = useCallback(async () => {
    setBusy(true); setProbe(null);
    try {
      const res = await fetch('/api/admin/billing/bog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'oauth' }) });
      const j = (await res.json().catch(() => ({}))) as { probe?: Probe };
      if (j.probe) setProbe(j.probe); else setErr(ka ? 'შემოწმება ვერ მოხერხდა' : 'Check failed');
    } catch {
      setErr(ka ? 'ქსელის შეცდომა' : 'Network error');
    } finally { setBusy(false); }
  }, [ka]);

  const flag = (ok: boolean, yes: string, no: string) => (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{ok ? yes : no}</span>
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4" data-testid="bog-readiness">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'საქართველოს ბანკი — მზადყოფნა' : 'Bank of Georgia — readiness'}</h2>
        <button disabled={busy || !r?.configured} onClick={runProbe} className="rounded-lg bg-cyan-500/90 px-3 py-1.5 text-[11.5px] font-semibold text-[#06060d] hover:bg-cyan-400 disabled:opacity-50">
          {busy ? (ka ? 'მოწმდება…' : 'Checking…') : (ka ? 'მონაცემების შემოწმება BOG-თან' : 'Test credentials with BOG')}
        </button>
      </div>
      {err && <p className="mb-2 text-[12px] text-rose-400">{err}</p>}
      {r && (
        <div className="space-y-2 text-[12px] text-gray-300">
          <div className="flex flex-wrap gap-2">
            {flag(r.configured, ka ? 'Credentials: არის' : 'Credentials set', ka ? 'Credentials: არ არის' : 'No credentials')}
            {r.environment && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase">{r.environment}</span>}
            {r.clientIdTail && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">client …{r.clientIdTail}</span>}
            {flag(r.schemaReady, ka ? 'ცხრილები: OK' : 'Schema OK', ka ? 'ცხრილები არ არის' : 'Schema missing')}
            {flag(r.cronSecretSet, 'CRON_SECRET', ka ? 'CRON_SECRET არ არის' : 'CRON_SECRET missing')}
            {r.checkoutMode && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${r.checkoutMode === 'public' ? 'bg-emerald-500/15 text-emerald-300' : r.checkoutMode === 'admin' ? 'bg-amber-500/15 text-amber-200' : 'bg-rose-500/15 text-rose-300'}`}>
                {r.checkoutMode === 'public'
                  ? (ka ? 'გადახდა: ყველასთვის' : 'Checkout: everyone')
                  : r.checkoutMode === 'admin'
                    ? (ka ? 'გადახდა: მხოლოდ ადმინი' : 'Checkout: admins only')
                    : (ka ? 'გადახდა: გამორთული' : 'Checkout: off')}
              </span>
            )}
          </div>
          {r.sandboxBlocked && (
            <p className="text-[11px] text-rose-400" data-testid="bog-sandbox-blocked">
              {ka
                ? 'Sandbox-ის მონაცემები ამ deploy-ზე დაბლოკილია: ის Production-ის ბაზას იყენებს. გადახდა გამორთულია.'
                : 'Sandbox credentials are blocked on this deployment: it uses the Production database. Checkout is off.'}
            </p>
          )}
          {r.limitsGel && r.paidGel && (
            <p className="text-[11px] text-gray-400" data-testid="bog-limits">
              {ka ? 'ბანკის ლიმიტი' : 'Bank limits'}: {ka ? 'ერთი გადახდა' : 'per payment'} ≤ {r.limitsGel.singleTransaction} ₾ · 24{ka ? 'სთ' : 'h'} {r.paidGel.last24h}/{r.limitsGel.per24h} ₾ · 30{ka ? ' დღე' : 'd'} {r.paidGel.last30d}/{r.limitsGel.per30d} ₾
              {' '}
              <span className="text-gray-500">
                ({ka ? 'მოძრავი ფანჯარა; ითვლის გადახდილ, დაბრუნებულ და შესამოწმებელ შეკვეთებს' : 'rolling windows; counts paid, refunded and under-review orders'}
                {r.paidGel.capped ? (ka ? '; 1000+ შეკვეთა' : '; 1000+ orders') : ''})
              </span>
            </p>
          )}
          <p className="break-all text-[11px] text-gray-500">callback: {r.callbackUrl}</p>
          {Object.keys(r.ordersByStatus).length > 0 && (
            <p className="text-[11px] text-gray-500">{Object.entries(r.ordersByStatus).map(([s, n]) => `${s}: ${n}`).join(' · ')}</p>
          )}
          {r.recentOrders.length > 0 && (
            <ul className="divide-y divide-white/[0.06] text-[11px]">
              {r.recentOrders.slice(0, 8).map((o, i) => (
                <li key={i} className="py-1">
                  <span className="tabular-nums text-gray-400">{o.createdAt.slice(0, 16).replace('T', ' ')}</span>{' '}
                  <span className="text-gray-200">{o.kind} {o.amountGel} ₾</span>{' '}
                  <span className={o.status === 'completed' ? 'text-emerald-400' : 'text-amber-300'}>{o.status}</span>
                  {o.rejectReason && <span className="block break-all text-gray-500">{o.rejectReason}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {probe && (
        <div className={`mt-3 rounded-lg border px-3 py-2 text-[12px] ${probe.verdict === 'ok' ? 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-200' : 'border-amber-500/20 bg-amber-500/[0.06] text-amber-100'}`}>
          <p className="font-semibold">{probe.verdict} · HTTP {probe.httpStatus || '—'} · {probe.environment ?? '—'} · {probe.tookMs} ms</p>
          {probe.answer && <p className="mt-1 break-all font-mono text-[11px] opacity-80">{probe.answer}</p>}
          <p className="mt-1 opacity-90">{probe.hint}</p>
        </div>
      )}
      <p className="mt-2 text-[10.5px] text-gray-600">{ka ? 'შემოწმება მხოლოდ ტოკენს ითხოვს — შეკვეთა არ იქმნება, თანხა არ ჩამოიჭრება.' : 'The check only requests a token — no order is created and nothing is charged.'}</p>
    </section>
  );
}
