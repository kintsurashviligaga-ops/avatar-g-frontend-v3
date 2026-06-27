'use client';

/**
 * CreditsModal — the billing / top-up surface behind the top-bar "X.XX ₾" chip.
 *
 * Signed-out → a "please sign in" gate with a Sign In button (defers to AuthModal
 * via onSignIn). Signed-in → the live GEL balance, free-films remaining (X / 3),
 * and three top-up packages. Card payment IS wired: "გადახდა" POSTs the package's GEL
 * amount to /api/billing/wallet-topup and full-redirects to Stripe Checkout. Failures
 * surface in a self-contained local toast (there is no ToastProvider in this tree, so
 * the toast is local state — never call useToast() here).
 *
 * Closable by ✕ · backdrop click · Escape. Rendered through a portal so it wins
 * the z-stack over the chat shell + cookie banner (mirrors AuthModal).
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, LogIn, CreditCard, Check } from 'lucide-react';
import { CREDIT_PACKAGES, CREDIT_COSTS, creditsToGel } from '@/lib/credits/pricing';
import { track } from '@/lib/analytics/track';

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

const PACKAGES = CREDIT_PACKAGES;
// Per-action credit costs used to render the "what can you do" guide.
const COST = CREDIT_COSTS;

const COPY: Record<Lang, {
  title: string; balance: string; freeVideos: string; pay: string; cardHint: string;
  comingSoon: string; payError: string; redirecting: string; signInNeeded: string; signIn: string; credits: string; close: string;
  starter: string; pro: string; max: string;
  videos: string; images: string;
  guideTitle: string; perCredit: string;
  gImage: string; gMusic: string; gVideo: string; gAvatar: string;
}> = {
  ka: {
    title: 'კრედიტები', balance: 'ბალანსი', freeVideos: 'უფასო ვიდეო', pay: 'გადახდა',
    cardHint: 'TBC / BOG ბარათით', comingSoon: 'მალე — გადახდა მალე დაემატება',
    payError: 'გადახდა ვერ დაიწყო — სცადეთ თავიდან', redirecting: 'გადამისამართება…',
    signInNeeded: 'შესვლა საჭიროა', signIn: 'შესვლა', credits: 'კრედიტი', close: 'დახურვა',
    starter: '📦 სტარტერი', pro: '💎 პრო', max: '🚀 მაქსი',
    videos: 'ვიდეო', images: 'სურათი',
    guideTitle: 'რას შეძლებ კრედიტებით?', perCredit: '1 კრედიტი = 0.10 ₾',
    gImage: '🖼 სურათი', gMusic: '🎵 მუსიკა 30წმ', gVideo: '🎬 ვიდეო 30წმ', gAvatar: '🎭 ავატარი',
  },
  en: {
    title: 'Credits', balance: 'Balance', freeVideos: 'Free videos', pay: 'Pay',
    cardHint: 'TBC / BOG card', comingSoon: 'Coming soon — payments arrive shortly',
    payError: 'Could not start checkout — please try again', redirecting: 'Redirecting…',
    signInNeeded: 'Please sign in first', signIn: 'Sign In', credits: 'credits', close: 'Close',
    starter: '📦 Starter', pro: '💎 Pro', max: '🚀 Max',
    videos: 'videos', images: 'images',
    guideTitle: 'What can you do with credits?', perCredit: '1 credit = 0.10 ₾',
    gImage: '🖼 Image', gMusic: '🎵 Music 30s', gVideo: '🎬 Video 30s', gAvatar: '🎭 Avatar',
  },
  ru: {
    title: 'Кредиты', balance: 'Баланс', freeVideos: 'Бесплатные видео', pay: 'Оплатить',
    cardHint: 'Картой TBC / BOG', comingSoon: 'Скоро — оплата появится в ближайшее время',
    payError: 'Не удалось начать оплату — попробуйте снова', redirecting: 'Перенаправление…',
    signInNeeded: 'Сначала войдите', signIn: 'Войти', credits: 'кред.', close: 'Закрыть',
    starter: '📦 Стартер', pro: '💎 Про', max: '🚀 Макс',
    videos: 'видео', images: 'фото',
    guideTitle: 'Что можно сделать за кредиты?', perCredit: '1 кредит = 0.10 ₾',
    gImage: '🖼 Фото', gMusic: '🎵 Музыка 30с', gVideo: '🎬 Видео 30с', gAvatar: '🎭 Аватар',
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
  // Per-package in-flight state for the checkout redirect (disables that Pay button).
  const [busyId, setBusyId] = useState<string | null>(null);

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

  // Start a Stripe Checkout for a credit package. POSTs the package's GEL amount to
  // the canonical one-time top-up route, then redirects to the returned Checkout URL.
  // On success the user lands back on /dashboard?topup=success and the chip refreshes.
  // Fail-open: 401 → sign-in, anything else → a self-contained error toast.
  const startCheckout = useCallback(async (pkg: { id: string; gel: number }) => {
    if (busyId) return;
    setBusyId(pkg.id);
    track('payment_initiated', { package: pkg.id, amount: pkg.gel }); // PHASE 4 Task 1
    try {
      const res = await fetch('/api/billing/wallet-topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amountGel: pkg.gel }),
      });
      if (res.status === 401) { setBusyId(null); onClose(); onSignIn(); return; }
      const j = (await res.json().catch(() => null)) as { url?: string } | null;
      if (res.ok && j?.url) { window.location.assign(j.url); return; } // full redirect to Stripe
      setBusyId(null);
      setToast(t.payError);
      window.setTimeout(() => setToast(null), 2600);
    } catch {
      setBusyId(null);
      setToast(t.payError);
      window.setTimeout(() => setToast(null), 2600);
    }
  }, [busyId, onClose, onSignIn, t.payError]);

  if (!mounted || typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div
      onClick={onClose}
      // FIX 4 — backdrop is rgba(0,0,0,0.6) with NO blur, so the sidebar + chat stay
      // visible (dimmed) behind the modal instead of the page going black. z-[110] keeps
      // it above the app's cookie banner (z-[60]); the panel below stacks above this.
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        onClick={(e) => e.stopPropagation()}
        className="relative z-[111] max-h-[90dvh] w-full max-w-[420px] overflow-y-auto overscroll-contain rounded-t-3xl border border-app-border/15 bg-app-surface shadow-[0_30px_90px_-20px_rgba(56,189,248,0.35)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:rounded-3xl"
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

            {/* Top-up packages — stack to one readable column at 375px (cards were ~95px /
                pay buttons ~26px in a 3-col grid), expand to 3 across on sm+ (>=640px). */}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {PACKAGES.map((p) => (
                <div key={p.id}
                  className={`relative flex flex-col items-center gap-1 rounded-2xl border p-3 text-center ${p.highlight ? 'border-app-accent/60 bg-app-accent/10 ring-1 ring-app-accent/30' : 'border-app-border/15 bg-app-bg/40'}`}>
                  {p.highlight && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-app-accent px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-app-bg">★</span>
                  )}
                  <span className="text-[12px] font-semibold text-app-text">{t[p.id]}</span>
                  <span className="text-[19px] font-bold leading-none tabular-nums text-app-text">{p.gel} ₾</span>
                  <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-app-accent">{p.credits} {t.credits}</span>
                  <span className="text-[9.5px] leading-tight text-app-muted">≈ {Math.floor(p.credits / COST.video_30s)} {t.videos}</span>
                  <span className="text-[9.5px] leading-tight text-app-muted">≈ {Math.floor(p.credits / COST.image_generate)} {t.images}</span>
                  <button type="button" onClick={() => startCheckout(p)} disabled={busyId !== null}
                    className={`mt-1 inline-flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-1 rounded-lg px-3 py-2.5 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-60 sm:min-h-0 sm:px-2 sm:py-1.5 ${p.highlight ? 'bg-app-accent text-app-bg' : 'bg-app-elevated text-app-text'}`}>
                    {busyId === p.id ? <><Loader2 size={12} className="animate-spin" /> {t.redirecting}</> : t.pay}
                  </button>
                  <span className="text-[9px] leading-tight text-app-muted">{t.cardHint}</span>
                </div>
              ))}
            </div>

            {/* What can you do with credits? */}
            <div className="mt-4 rounded-2xl border border-app-border/15 bg-app-bg/40 px-4 py-3">
              <p className="text-[12.5px] font-semibold text-app-text">{t.guideTitle}</p>
              <p className="mt-0.5 text-[11px] text-app-muted">{t.perCredit}</p>
              <ul className="mt-2 space-y-1 text-[12px] text-app-text">
                {([[t.gImage, COST.image_generate], [t.gMusic, COST.music_30s], [t.gVideo, COST.video_30s], [t.gAvatar, COST.avatar_30s]] as const).map(([label, credits]) => (
                  <li key={label} className="flex items-center justify-between gap-3">
                    <span>{label}</span>
                    <span className="tabular-nums text-app-muted">{credits} {t.credits} <span className="text-app-muted/70">({creditsToGel(credits).toFixed(2)} ₾)</span></span>
                  </li>
                ))}
              </ul>
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
