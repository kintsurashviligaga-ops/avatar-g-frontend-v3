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
  // Cyber-Black: charcoal #030303 base, zinc-800/60 border, zinc-100 text, soft
  // cyan glow held back to a hint rather than a full neon ring.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Wallet balance"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-zinc-800/70 bg-[#030303]/85 backdrop-blur-md text-[12px] font-semibold text-zinc-100 hover:border-zinc-600/80 hover:bg-[#050505] transition active:scale-95 shadow-[0_0_14px_-7px_rgba(56,189,248,0.55)]"
    >
      <span aria-hidden className="text-zinc-300">₾</span>
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
        className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center p-3 bg-black/80 backdrop-blur-md"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 24, scale: 0.98, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          // Cyber-Black drawer: charcoal canvas, zinc-800 border, deep shadow.
          // Bottom-attached on mobile (items-end), centered on desktop.
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
          className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-zinc-800/70 bg-[#030303] p-5 shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.95)] sm:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="inline-flex items-center gap-2 text-[15px] font-semibold text-zinc-100">
              <Wallet size={17} className="text-zinc-300" /> {title}
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className="h-7 w-7 rounded-full flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition active:scale-90">
              <X size={15} />
            </button>
          </div>

          {requiredAmount ? (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-[12.5px] text-amber-200 leading-relaxed">
              {insufficientBalanceMessage(requiredAmount, locale)}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2.5">
            {REFILL_TIERS_GEL.map((tier) => {
              const isPower = tier === 500;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() => void charge(tier)}
                  disabled={busy !== null}
                  className={
                    isPower
                      // Top tier gets the only neon accent in the grid — a deliberate
                      // visual anchor for the 500 ₾ power-user choice.
                      ? 'relative inline-flex items-center justify-center gap-1.5 h-14 rounded-2xl font-semibold text-[17px] text-zinc-50 bg-[#070707] border border-cyan-400/30 hover:border-cyan-300/50 hover:bg-[#0b0b0b] disabled:opacity-60 transition-all duration-200 active:scale-[0.98] shadow-[0_0_22px_-8px_rgba(56,189,248,0.55)] tabular-nums col-span-2'
                      : 'relative inline-flex items-center justify-center gap-1.5 h-14 rounded-2xl font-semibold text-[17px] text-zinc-100 bg-[#070707] border border-zinc-800/80 hover:border-zinc-600/80 hover:bg-[#0b0b0b] disabled:opacity-60 transition-all duration-200 active:scale-[0.98] tabular-nums'
                  }
                >
                  {busy === tier ? <Loader2 size={18} className="animate-spin" /> : `${tier} ₾`}
                  {tier === MIN_REFILL_GEL && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-zinc-200 text-zinc-900 whitespace-nowrap">
                      {locale === 'ka' ? 'მინ.' : 'min'}
                    </span>
                  )}
                  {isPower && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-cyan-400 text-zinc-950 whitespace-nowrap">
                      {locale === 'ka' ? 'პრემიუმი' : locale === 'ru' ? 'премиум' : 'premium'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && <p className="mt-3 text-[12px] text-rose-300 leading-relaxed">{error}</p>}
          <p className="mt-3 text-[11px] text-zinc-500 leading-relaxed">
            {locale === 'ka' ? 'გადახდა მუშავდება Stripe-ით (₾ / GEL).' : locale === 'ru' ? 'Оплата через Stripe (₾ / GEL).' : 'Secure checkout via Stripe (₾ / GEL).'}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
