'use client';

/**
 * GEL wallet UI — the neon balance chip + the refill grid / pre-flight modal.
 * Reuses the same modal for both "open wallet" and the cost-guardrail
 * "insufficient balance" interception (PHASE 4).
 */

import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, X, Loader2 } from 'lucide-react';
import { REFILL_TIERS_GEL, MIN_REFILL_GEL, formatGEL, insufficientBalanceMessage } from '@/lib/billing/gel';

export function BalanceChip({ balanceGel, onClick }: { balanceGel: number | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Wallet balance"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-sky-400/30 bg-black/60 backdrop-blur-md text-[12px] font-bold text-sky-100 hover:border-sky-300/50 hover:bg-black/80 transition active:scale-95 shadow-[0_0_16px_-5px_rgba(56,189,248,0.7)]"
    >
      <span aria-hidden>💰</span>
      <span className="tabular-nums">{formatGEL(balanceGel ?? 0)}</span>
    </button>
  );
}

export function WalletRefillModal({
  open, locale, requiredAmount, onClose,
}: {
  open: boolean;
  locale: string;
  requiredAmount?: number | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const charge = useCallback(async (amountGel: number) => {
    setBusy(amountGel); setError(null);
    try {
      const res = await fetch('/api/billing/wallet-topup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ amountGel }),
      });
      const j = await res.json().catch(() => ({})) as { url?: string; error?: string };
      if (res.ok && j.url) { window.location.href = j.url; return; }
      setError(
        res.status === 401 ? (locale === 'ka' ? 'გაიარე ავტორიზაცია საფულის შესავსებად.' : locale === 'ru' ? 'Войдите, чтобы пополнить кошелёк.' : 'Sign in to top up your wallet.')
        : (locale === 'ka' ? 'გადახდა ვერ დაიწყო. სცადე მოგვიანებით.' : locale === 'ru' ? 'Не удалось начать оплату. Попробуйте позже.' : 'Could not start checkout. Please try again later.'),
      );
    } catch {
      setError(locale === 'ka' ? 'ქსელის შეცდომა.' : locale === 'ru' ? 'Сетевая ошибка.' : 'Network error.');
    } finally {
      setBusy(null);
    }
  }, [locale]);

  if (!open) return null;
  const title = locale === 'ka' ? 'შეავსე საფულე' : locale === 'ru' ? 'Пополнить кошелёк' : 'Top up wallet';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 24, scale: 0.98, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-sm rounded-3xl border border-sky-400/20 bg-[#05080d] p-5 shadow-[0_24px_80px_-24px_rgba(56,189,248,0.5)]"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="inline-flex items-center gap-2 text-[15px] font-bold text-white">
              <Wallet size={17} className="text-sky-300" /> {title}
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className="h-7 w-7 rounded-full flex items-center justify-center text-white/55 hover:text-white hover:bg-white/[0.08] transition active:scale-90">
              <X size={15} />
            </button>
          </div>

          {requiredAmount ? (
            <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 text-[12.5px] text-amber-100 leading-relaxed">
              {insufficientBalanceMessage(requiredAmount, locale)}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5">
            {REFILL_TIERS_GEL.map((tier) => (
              <button
                key={tier}
                type="button"
                onClick={() => void charge(tier)}
                disabled={busy !== null}
                className="relative inline-flex items-center justify-center gap-1.5 h-14 rounded-2xl font-bold text-[17px] text-white bg-gradient-to-br from-cyan-400/90 to-blue-600/90 hover:from-cyan-300 hover:to-blue-500 disabled:opacity-60 transition-all duration-200 active:scale-[0.98] shadow-[0_8px_28px_-10px_rgba(56,189,248,0.7)] tabular-nums"
              >
                {busy === tier ? <Loader2 size={18} className="animate-spin" /> : `${tier} ₾`}
                {tier === MIN_REFILL_GEL && (
                  <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-sky-500/90 text-white whitespace-nowrap">
                    {locale === 'ka' ? 'მინ.' : 'min'}
                  </span>
                )}
              </button>
            ))}
          </div>

          {error && <p className="mt-3 text-[12px] text-rose-300 leading-relaxed">{error}</p>}
          <p className="mt-3 text-[11px] text-white/35 leading-relaxed">
            {locale === 'ka' ? 'გადახდა მუშავდება Stripe-ით (₾ / GEL).' : locale === 'ru' ? 'Оплата через Stripe (₾ / GEL).' : 'Secure checkout via Stripe (₾ / GEL).'}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
