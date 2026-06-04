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
  // Theme-aware chip: app-bg base, app-border hairline, app-text label, soft
  // cyan glow held back to a hint rather than a full neon ring.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Wallet balance"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-app-border/15 bg-app-bg/85 backdrop-blur-md text-[12px] font-semibold text-app-text hover:border-app-border/30 hover:bg-app-elevated transition active:scale-95 shadow-[0_0_14px_-7px_rgba(56,189,248,0.55)]"
    >
      <span aria-hidden className="text-app-muted">₾</span>
      <span className="tabular-nums">{formatGEL(balanceGel ?? 0)}</span>
    </button>
  );
}

export function WalletRefillModal({
  open, locale, requiredAmount, variant = 'theme', onClose,
}: {
  open: boolean;
  locale: string;
  requiredAmount?: number | null;
  /**
   * 'theme'   → app-token skin that respects light/dark (chat surfaces).
   * 'obsidian'→ hard pure-#000000 / white / electric-cyan skin for the always-
   *             dark Film Studio shell, so the modal never flashes a light card
   *             over the OLED-black studio.
   */
  variant?: 'theme' | 'obsidian';
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const obsidian = variant === 'obsidian';

  // Skin map — the 'theme' branch keeps the exact original token classes so the
  // chat surfaces are untouched; 'obsidian' hardcodes the 3-tone studio palette.
  const skin = {
    panel: obsidian
      ? 'w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-white/10 bg-black p-5 shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.95)] sm:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]'
      : 'w-full max-w-sm rounded-t-3xl sm:rounded-3xl border border-app-border/15 bg-app-bg p-5 shadow-[0_-12px_60px_-12px_rgba(0,0,0,0.95)] sm:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]',
    title: obsidian ? 'text-white' : 'text-app-text',
    icon: obsidian ? 'text-[#00D2FF]' : 'text-app-muted',
    close: obsidian
      ? 'text-neutral-400 hover:text-white hover:bg-white/10'
      : 'text-app-muted hover:text-app-text hover:bg-app-elevated/60',
    tierPower: obsidian
      ? 'relative inline-flex items-center justify-center gap-1.5 h-14 rounded-2xl font-semibold text-[17px] text-white bg-[#00D2FF]/10 border border-[#00D2FF]/40 hover:border-[#00D2FF]/60 hover:bg-[#00D2FF]/20 disabled:opacity-60 transition-all duration-200 active:scale-[0.98] shadow-[0_0_22px_-8px_rgba(0,210,255,0.55)] tabular-nums col-span-2'
      : 'relative inline-flex items-center justify-center gap-1.5 h-14 rounded-2xl font-semibold text-[17px] text-app-text bg-app-elevated border border-cyan-400/30 hover:border-cyan-300/50 hover:bg-app-surface disabled:opacity-60 transition-all duration-200 active:scale-[0.98] shadow-[0_0_22px_-8px_rgba(56,189,248,0.55)] tabular-nums col-span-2',
    tier: obsidian
      ? 'relative inline-flex items-center justify-center gap-1.5 h-14 rounded-2xl font-semibold text-[17px] text-white bg-black border border-white/10 hover:border-[#00D2FF]/40 hover:bg-white/5 disabled:opacity-60 transition-all duration-200 active:scale-[0.98] tabular-nums'
      : 'relative inline-flex items-center justify-center gap-1.5 h-14 rounded-2xl font-semibold text-[17px] text-app-text bg-app-elevated border border-app-border/15 hover:border-app-border/30 hover:bg-app-surface disabled:opacity-60 transition-all duration-200 active:scale-[0.98] tabular-nums',
    minBadge: obsidian ? 'bg-white text-black' : 'bg-app-text text-app-bg',
    premiumBadge: obsidian ? 'bg-[#00D2FF] text-black' : 'bg-cyan-400 text-zinc-950',
    note: obsidian ? 'text-neutral-500' : 'text-app-muted',
    error: obsidian ? 'text-red-300' : 'text-rose-600 dark:text-rose-300',
  };

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
        // Apple IAP compliance: the entire Stripe (₾/GEL) refill modal is hidden
        // inside the native iOS shell — digital top-ups are a web purchase.
        data-iap-external
      >
        <motion.div
          initial={{ y: 24, scale: 0.98, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }} exit={{ y: 24, scale: 0.98, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          // Theme-aware drawer: app-bg canvas, app-border hairline, deep shadow.
          // Bottom-attached on mobile (items-end), centered on desktop.
          style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))' }}
          className={skin.panel}
        >
          <div className="flex items-center justify-between mb-4">
            <span className={`inline-flex items-center gap-2 text-[15px] font-semibold ${skin.title}`}>
              <Wallet size={17} className={skin.icon} /> {title}
            </span>
            <button type="button" onClick={onClose} aria-label="Close" className={`h-7 w-7 rounded-full flex items-center justify-center transition active:scale-90 ${skin.close}`}>
              <X size={15} />
            </button>
          </div>

          {requiredAmount ? (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 text-[12.5px] text-amber-700 dark:text-amber-200 leading-relaxed">
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
                  className={isPower ? skin.tierPower : skin.tier}
                >
                  {busy === tier ? <Loader2 size={18} className="animate-spin" /> : `${tier} ₾`}
                  {tier === MIN_REFILL_GEL && (
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full whitespace-nowrap ${skin.minBadge}`}>
                      {locale === 'ka' ? 'მინ.' : 'min'}
                    </span>
                  )}
                  {isPower && (
                    <span className={`absolute -top-2 left-1/2 -translate-x-1/2 text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full whitespace-nowrap ${skin.premiumBadge}`}>
                      {locale === 'ka' ? 'პრემიუმი' : locale === 'ru' ? 'премиум' : 'premium'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {error && <p className={`mt-3 text-[12px] leading-relaxed ${skin.error}`}>{error}</p>}
          <p className={`mt-3 text-[11px] leading-relaxed ${skin.note}`}>
            {locale === 'ka' ? 'გადახდა მუშავდება Stripe-ით (₾ / GEL).' : locale === 'ru' ? 'Оплата через Stripe (₾ / GEL).' : 'Secure checkout via Stripe (₾ / GEL).'}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
