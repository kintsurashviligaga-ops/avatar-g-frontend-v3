'use client';

/**
 * CreditsModal — the billing / top-up surface behind the top-bar "X.XX ₾" chip.
 *
 * Signed-out → a "please sign in" gate with a Sign In button (defers to AuthModal
 * via onSignIn). Signed-in → the live GEL balance, free-films remaining (X / 3),
 * and three top-up packages. Card payment isn't wired yet, so "გადახდა" raises a
 * self-contained "Coming soon" toast (there is no ToastProvider in this tree, so
 * the toast is local state — never call useToast() here).
 *
 * Closable by ✕ · backdrop click · Escape. Rendered through a portal so it wins
 * the z-stack over the chat shell + cookie banner (mirrors AuthModal).
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, LogIn, CreditCard, Check } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

interface CreditsModalProps {
  open: boolean;
  locale: string;
  /** Live GEL wallet balance (from /api/credits/balance), or null while loading. */
  balanceGel: number | null;
  /** Whether a Supabase session exists (gates the billing body vs. the sign-in CTA). */
  authed: boolean;
  onClose: () => void;
  /** Opens the AuthModal — used by the signed-out gate. */
  onSignIn: () => void;
}

type Pkg = { id: 'starter' | 'pro' | 'max'; gel: number; credits: number; highlight: boolean };
const PACKAGES: ReadonlyArray<Pkg> = [
  { id: 'starter', gel: 5, credits: 10, highlight: false },
  { id: 'pro', gel: 20, credits: 50, highlight: true },
  { id: 'max', gel: 50, credits: 150, highlight: false },
];

const COPY: Record<Lang, {
  title: string; balance: string; freeVideos: string; pay: string; cardHint: string;
  comingSoon: string; signInNeeded: string; signIn: string; credits: string; close: string;
  starter: string; pro: string; max: string;
}> = {
  ka: {
    title: 'კრედიტები', balance: 'ბალანსი', freeVideos: 'უფასო ვიდეო', pay: 'გადახდა',
    cardHint: 'TBC / BOG ბარათით', comingSoon: 'მალე — გადახდა მალე დაემატება',
    signInNeeded: 'შესვლა საჭიროა', signIn: 'შესვლა', credits: 'კრედიტი', close: 'დახურვა',
    starter: 'Starter', pro: 'Pro', max: 'Max',
  },
  en: {
    title: 'Credits', balance: 'Balance', freeVideos: 'Free videos', pay: 'Pay',
    cardHint: 'TBC / BOG card', comingSoon: 'Coming soon — payments arrive shortly',
    signInNeeded: 'Please sign in first', signIn: 'Sign In', credits: 'credits', close: 'Close',
    starter: 'Starter', pro: 'Pro', max: 'Max',
  },
  ru: {
    title: 'Кредиты', balance: 'Баланс', freeVideos: 'Бесплатные видео', pay: 'Оплатить',
    cardHint: 'Картой TBC / BOG', comingSoon: 'Скоро — оплата появится в ближайшее время',
    signInNeeded: 'Сначала войдите', signIn: 'Войти', credits: 'кредитов', close: 'Закрыть',
    starter: 'Starter', pro: 'Pro', max: 'Max',
  },
};

export function CreditsModal({ open, locale, balanceGel, authed, onClose, onSignIn }: CreditsModalProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [freeFilms, setFreeFilms] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Pull the authoritative free-films count when the modal opens for a signed-in user.
  useEffect(() => {
    if (!open || !authed) return;
    let alive = true;
    setLoading(true);
    fetch('/api/profile/onboarding', { cache: 'no-store', credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { state?: { freeFilmsRemaining?: number } | null } | null) => {
        if (alive && typeof j?.state?.freeFilmsRemaining === 'number') setFreeFilms(j.state.freeFilmsRemaining);
      })
      .catch(() => { /* fail-soft — the line just shows — / 3 */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, authed]);

  // Escape-to-close + lock body scroll while open (mirrors AuthModal).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);

  const showComingSoon = useCallback(() => {
    setToast(t.comingSoon);
    window.setTimeout(() => setToast(null), 2600);
  }, [t.comingSoon]);

  if (!mounted || typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-3xl border border-app-border/15 bg-app-surface shadow-[0_30px_90px_-20px_rgba(56,189,248,0.35)]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600">
              <CreditCard size={15} className="text-white" />
            </span>
            <h2 className="text-[17px] font-bold tracking-tight text-app-text">{t.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close}
            className="flex h-9 w-9 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
            <X size={17} />
          </button>
        </div>

        {!authed ? (
          /* ── Signed-out gate ──────────────────────────────────────────────── */
          <div className="flex flex-col items-center gap-4 px-6 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-app-elevated text-app-accent">
              <Sparkles size={22} />
            </span>
            <p className="text-[14px] font-medium text-app-text">{t.signInNeeded}</p>
            <button type="button" onClick={() => { onClose(); onSignIn(); }}
              className="inline-flex items-center gap-2 rounded-xl bg-app-accent px-5 py-2.5 text-[14px] font-semibold text-app-bg transition-opacity hover:opacity-90">
              <LogIn size={16} /> {t.signIn}
            </button>
          </div>
        ) : (
          /* ── Signed-in billing body ───────────────────────────────────────── */
          <div className="px-5 pb-5 pt-4">
            {/* Balance + free videos */}
            <div className="rounded-2xl bg-app-elevated/60 px-4 py-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">{t.balance}</p>
              <p className="mt-0.5 text-[34px] font-bold leading-none tabular-nums text-app-text">{(balanceGel ?? 0).toFixed(2)} ₾</p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-app-muted">
                🎬 {t.freeVideos}: <span className="font-semibold tabular-nums text-app-text">{loading && freeFilms === null ? <Loader2 size={12} className="inline animate-spin" /> : (freeFilms ?? '—')}</span> / 3
              </p>
            </div>

            {/* Top-up packages */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {PACKAGES.map((p) => (
                <div key={p.id}
                  className={`relative flex flex-col items-center gap-1 rounded-2xl border p-3 text-center ${p.highlight ? 'border-app-accent/60 bg-app-accent/10 ring-1 ring-app-accent/30' : 'border-app-border/15 bg-app-bg/40'}`}>
                  {p.highlight && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-app-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-bg">★</span>
                  )}
                  <span className="text-[12px] font-semibold text-app-text">{t[p.id]}</span>
                  <span className="text-[19px] font-bold leading-none tabular-nums text-app-text">{p.gel} ₾</span>
                  <span className="inline-flex items-center gap-0.5 text-[10.5px] text-app-muted">≈ {p.credits} {t.credits}</span>
                  <button type="button" onClick={showComingSoon}
                    className={`mt-1 w-full rounded-lg px-2 py-1.5 text-[12px] font-semibold transition-opacity hover:opacity-90 ${p.highlight ? 'bg-app-accent text-app-bg' : 'bg-app-elevated text-app-text'}`}>
                    {t.pay}
                  </button>
                  <span className="text-[9px] leading-tight text-app-muted">{t.cardHint}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Self-contained toast (no ToastProvider in this tree) */}
        {toast && (
          <div className="mx-5 mb-5 flex items-center gap-2 rounded-xl bg-app-elevated px-3.5 py-2.5 text-[12.5px] font-medium text-app-text ring-1 ring-app-border/15">
            <Check size={14} className="shrink-0 text-app-accent" /> {toast}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default CreditsModal;
