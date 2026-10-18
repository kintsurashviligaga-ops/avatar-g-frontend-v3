'use client';

/**
 * PricesPanel — what each paid button charges, what it costs us, and whether the profit clears the owner's 100 % rule
 * (GET /api/admin/prices, lib/admin/priceSheet). Read-only: every number comes from the pricing source of truth at
 * request time, so a price change there shows here with no edit.
 */
import { useEffect, useState } from 'react';
import type { PlanRow, PriceRow } from '@/lib/admin/priceSheet';

interface Pack { gelAmount: number; creditsAmount: number; label: string | null }
interface Payload {
  assumptions: { creditGel: number; vatRate: number; paymentFeeRate: number; fxReserve: number; gelPerUsd: number; netGelPerCredit: number; minMarkup: number };
  services: PriceRow[];
  plans: PlanRow[];
  packs: Pack[];
  packsFromDefaults: boolean;
}

const gel = (n: number | null) => (n === null ? '—' : `${n.toFixed(2)} ₾`);

export default function PricesPanel({ ka }: { ka: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    fetch('/api/admin/prices', { cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<Payload>) : Promise.reject(r.status)))
      .then(setData)
      .catch(() => setErr(true));
  }, []);

  if (err) return <p className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">{ka ? 'ჩატვირთვა ვერ მოხერხდა' : 'Failed to load'}</p>;
  if (!data) return <p className="py-6 text-center text-[12px] text-gray-500">{ka ? 'იტვირთება…' : 'Loading…'}</p>;

  const a = data.assumptions;
  const below = data.services.filter((s) => s.ok === false);

  return (
    <div className="space-y-4">
      <p className="text-[12px] leading-relaxed text-gray-400">
        {ka
          ? `1 კრედიტი = ${a.creditGel} ₾. დღგ ${Math.round(a.vatRate * 100)}% და ბარათის საკომისიო ${Math.round(a.paymentFeeRate * 100)}% გამოკლებით გვრჩება ${a.netGelPerCredit} ₾ კრედიტზე. ხარჯი შეიცავს ${Math.round(a.fxReserve * 100)}% სავალუტო რეზერვს ($1 = ${a.gelPerUsd} ₾). მარჟა = (წმინდა − ხარჯი) / ხარჯი, მიზანი ≥ ${a.minMarkup * 100}%.`
          : `1 credit = ${a.creditGel} ₾. After ${Math.round(a.vatRate * 100)}% VAT and the ${Math.round(a.paymentFeeRate * 100)}% card fee we keep ${a.netGelPerCredit} ₾ per credit. Cost includes a ${Math.round(a.fxReserve * 100)}% FX reserve ($1 = ${a.gelPerUsd} ₾). Markup = (net − cost) / cost, target ≥ ${a.minMarkup * 100}%.`}
      </p>

      {below.length > 0 && (
        <p className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] px-3 py-2 text-[12px] text-rose-300">
          {ka ? `100%-ზე დაბალი მარჟა: ${below.map((s) => s.label.ka).join(', ')}` : `Below 100% markup: ${below.map((s) => s.label.en).join(', ')}`}
        </p>
      )}

      <section className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
        <table className="w-full min-w-[560px] text-[12.5px]">
          <thead>
            <tr className="border-b border-white/[0.08] text-left text-[10.5px] uppercase tracking-wider text-gray-500">
              <th className="px-4 py-2 font-semibold">{ka ? 'სერვისი' : 'Service'}</th>
              <th className="px-3 py-2 text-right font-semibold">{ka ? 'კრედიტი' : 'Credits'}</th>
              <th className="px-3 py-2 text-right font-semibold">{ka ? 'ფასი' : 'Price'}</th>
              <th className="px-3 py-2 text-right font-semibold">{ka ? 'წმინდა' : 'Net'}</th>
              <th className="px-3 py-2 text-right font-semibold">{ka ? 'ხარჯი' : 'Cost'}</th>
              <th className="px-4 py-2 text-right font-semibold">{ka ? 'მარჟა' : 'Markup'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {data.services.map((s) => (
              <tr key={s.id} className={s.ok === false ? 'bg-rose-500/[0.05]' : undefined}>
                <td className="px-4 py-2 text-gray-200">{ka ? s.label.ka : s.label.en}</td>
                <td className="px-3 py-2 text-right tabular-nums text-cyan-300">{s.credits}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-300">{gel(s.priceGel)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-400">{gel(s.netGel)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-gray-400">{s.costGel === null ? (ka ? 'დაბლოკილი' : 'blocked') : gel(s.costGel)}</td>
                <td className={`px-4 py-2 text-right font-semibold tabular-nums ${s.ok === null ? 'text-gray-500' : s.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {s.markup === null ? '—' : `${Math.round(s.markup * 100)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{ka ? 'პაკეტები (თვიური)' : 'Plans (monthly)'}</h2>
          <ul className="divide-y divide-white/[0.06]">
            {data.plans.map((p) => (
              <li key={p.tier} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                <span className="text-gray-200">{ka ? p.name.ka : p.name.en}</span>
                <span className="tabular-nums text-cyan-300">{p.credits} {ka ? 'კრ.' : 'cr'}</span>
                <span className="tabular-nums text-gray-500">{p.gelPerCredit} ₾/{ka ? 'კრ.' : 'cr'}</span>
                <span className="w-20 text-right font-semibold tabular-nums text-gray-100">{p.priceGel} ₾</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            {ka ? 'შევსების პაკეტები' : 'Top-up packs'}
            {data.packsFromDefaults && <span className="ml-2 normal-case tracking-normal text-gray-600">{ka ? '(ნაგულისხმევი)' : '(defaults)'}</span>}
          </h2>
          <ul className="divide-y divide-white/[0.06]">
            {data.packs.map((p) => (
              <li key={`${p.gelAmount}-${p.creditsAmount}`} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                <span className="text-gray-200">{p.label ?? `${p.gelAmount} ₾`}</span>
                <span className="tabular-nums text-cyan-300">{p.creditsAmount} {ka ? 'კრ.' : 'cr'}</span>
                <span className="w-20 text-right font-semibold tabular-nums text-gray-100">{p.gelAmount} ₾</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
