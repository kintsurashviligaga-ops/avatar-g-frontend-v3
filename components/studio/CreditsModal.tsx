'use client';

/**
 * CreditsModal — THE billing surface (the balance chip and the pricing page both open it).
 *
 * Signed-out → a sign-in gate. Signed-in → the balance, the live plan (with "cancel auto-renewal"), the three
 * monthly plans and PAYG top-ups.
 *
 * Payment rail, probed from the secretless /api/checkout/capabilities when the modal opens:
 *   · Bank of Georgia (live) — prices shown in ₾, because ₾ is what BOG charges; plans renew monthly on the card
 *     saved at the first payment (/api/billing/bog/checkout). The return trip is handled in ChatChrome (?bog=…).
 *   · otherwise the older card checkout keeps working as it did (USD tier packs / GEL wallet top-up), unannounced;
 *   · neither → the buttons are disabled with a plain notice, never a click that 503s.
 *
 * Failures surface in a self-contained local toast (there is no ToastProvider in this tree, so never useToast()).
 * Closable by ✕ · backdrop click · Escape. Rendered through a portal so it wins the z-stack (mirrors AuthModal).
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, LogIn, CreditCard, AlertCircle, Check, ShieldCheck } from 'lucide-react';
import { PRICING_TIERS, type PricingTierId } from '@/lib/billing/pricingConfig';
import { formatCreditBalance } from '@/lib/billing/gel';
import { BOG_TOPUP_PACKS_GEL, bogPlanOffer, topupCredits } from '@/lib/billing/bogCatalog';
import {
  cancelBogRenewal,
  fetchBogPlan,
  formatPlanDate,
  navigateToPayment,
  planName,
  startBogCheckout,
  type BogPlanSummary,
} from '@/lib/billing/bogCheckoutClient';
import { track } from '@/lib/analytics/track';
import { useDialogA11y } from '@/hooks/useDialogA11y';

type Lang = 'ka' | 'en' | 'ru';

interface CreditsModalProps {
  open: boolean;
  locale: string;
  /** Live balance (from /api/credits/balance), or null while loading. */
  balanceGel: number | null;
  /** Whether a Supabase session exists (gates the billing body vs. the sign-in CTA). */
  authed: boolean;
  onClose: () => void;
  /** Opens the AuthModal — used by the signed-out gate. */
  onSignIn: () => void;
}

/** The paid rungs of the pricing page's ladder — the SAME data the /pricing page renders. */
const PACKAGES = PRICING_TIERS.filter((t) => t.priceUsd > 0);

interface Copy {
  title: string; balance: string; freeVideos: string; pay: string; cardHint: string; secureBog: string; unavailable: string;
  payError: string; redirecting: string; redirectingBog: string; signInNeeded: string; signIn: string; credits: string;
  close: string; viewAllPlans: string; plansTitle: string; topupTitle: string; subscribe: string; perMonth: string;
  monthlyCredits: (n: number) => string; yourPlan: string; currentPlan: string; renewsOn: (d: string) => string;
  activeUntil: (d: string) => string; cancelRenewal: string; cancelConfirm: (d: string) => string; yesCancel: string;
  keep: string; renewalCanceled: string; cancelError: string; alreadySubscribed: string; popular: string;
}

const COPY: Record<Lang, Copy> = {
  ka: {
    title: 'კრედიტები', balance: 'ბალანსი', freeVideos: 'უფასო ვიდეო', pay: 'გადახდა',
    cardHint: 'უსაფრთხო გადახდა ბარათით', secureBog: 'უსაფრთხო გადახდა — საქართველოს ბანკი (₾)',
    unavailable: 'გადახდა დროებით მიუწვდომელია. სცადეთ მოგვიანებით.',
    payError: 'გადახდა ვერ დაიწყო — სცადეთ თავიდან', redirecting: 'გადამისამართება…',
    redirectingBog: 'საქართველოს ბანკზე გადასვლა…',
    signInNeeded: 'შესვლა საჭიროა', signIn: 'შესვლა', credits: 'კრედიტი', close: 'დახურვა', viewAllPlans: 'ყველა გეგმის ნახვა →',
    plansTitle: 'ყოველთვიური გეგმები', topupTitle: 'კრედიტების შევსება', subscribe: 'გამოწერა', perMonth: '/ თვე',
    monthlyCredits: (n) => `${n} კრედიტი ყოველთვიურად`,
    yourPlan: 'თქვენი გეგმა', currentPlan: 'მიმდინარე გეგმა',
    renewsOn: (d) => `განახლდება ${d}`, activeUntil: (d) => `აქტიურია ${d}-მდე`,
    cancelRenewal: 'ავტომატური განახლების გაუქმება',
    cancelConfirm: (d) => `გეგმა აქტიური დარჩება ${d}-მდე და თანხა აღარ ჩამოგეჭრებათ. გავაუქმოთ განახლება?`,
    yesCancel: 'დიახ, გაუქმება', keep: 'დატოვება', renewalCanceled: 'ავტომატური განახლება გაუქმდა.',
    cancelError: 'გაუქმება ვერ მოხერხდა — სცადეთ თავიდან.', alreadySubscribed: 'ეს გეგმა უკვე აქტიურია.', popular: 'პოპულარული',
  },
  en: {
    title: 'Credits', balance: 'Balance', freeVideos: 'Free videos', pay: 'Pay',
    cardHint: 'Secure card checkout', secureBog: 'Secure payment by Bank of Georgia (₾)',
    unavailable: 'Payments are temporarily unavailable. Please try again later.',
    payError: 'Could not start checkout — please try again', redirecting: 'Redirecting…',
    redirectingBog: 'Opening Bank of Georgia…',
    signInNeeded: 'Please sign in first', signIn: 'Sign In', credits: 'credits', close: 'Close', viewAllPlans: 'View all plans →',
    plansTitle: 'Monthly plans', topupTitle: 'Top up credits', subscribe: 'Subscribe', perMonth: '/ mo',
    monthlyCredits: (n) => `${n} credits every month`,
    yourPlan: 'Your plan', currentPlan: 'Current plan',
    renewsOn: (d) => `Renews ${d}`, activeUntil: (d) => `Active until ${d}`,
    cancelRenewal: 'Cancel auto-renewal',
    cancelConfirm: (d) => `Your plan stays active until ${d} and you won’t be charged again. Cancel renewal?`,
    yesCancel: 'Yes, cancel', keep: 'Keep plan', renewalCanceled: 'Auto-renewal cancelled.',
    cancelError: 'Could not cancel — please try again.', alreadySubscribed: 'This plan is already active.', popular: 'Popular',
  },
  ru: {
    title: 'Кредиты', balance: 'Баланс', freeVideos: 'Бесплатные видео', pay: 'Оплатить',
    cardHint: 'Безопасная оплата картой', secureBog: 'Безопасная оплата — Bank of Georgia (₾)',
    unavailable: 'Оплата временно недоступна. Попробуйте позже.',
    payError: 'Не удалось начать оплату — попробуйте снова', redirecting: 'Перенаправление…',
    redirectingBog: 'Переход в Bank of Georgia…',
    signInNeeded: 'Сначала войдите', signIn: 'Войти', credits: 'кред.', close: 'Закрыть', viewAllPlans: 'Все тарифы →',
    plansTitle: 'Ежемесячные тарифы', topupTitle: 'Пополнить кредиты', subscribe: 'Подписаться', perMonth: '/ мес',
    monthlyCredits: (n) => `${n} кредитов ежемесячно`,
    yourPlan: 'Ваш тариф', currentPlan: 'Текущий тариф',
    renewsOn: (d) => `Продлится ${d}`, activeUntil: (d) => `Активен до ${d}`,
    cancelRenewal: 'Отменить автопродление',
    cancelConfirm: (d) => `Тариф останется активным до ${d}, повторных списаний не будет. Отменить продление?`,
    yesCancel: 'Да, отменить', keep: 'Оставить', renewalCanceled: 'Автопродление отменено.',
    cancelError: 'Не удалось отменить — попробуйте снова.', alreadySubscribed: 'Этот тариф уже активен.', popular: 'Популярный',
  },
};

// PHASE 39 (Master Contract V1/V2) — localized tier NAMES + the exact premium USD feature bullets per tier.
// The Georgian copy is authoritative (the directive's launch spec); en/ru are faithful translations.
const TIER_NAME: Record<PricingTierId, Record<Lang, string>> = {
  free: { ka: 'უფასო', en: 'Free', ru: 'Бесплатно' },
  basic: { ka: 'საბაზისო', en: 'Basic', ru: 'Базовый' },
  pro: { ka: 'პრო', en: 'Pro', ru: 'Про' },
  business: { ka: 'ბიზნესი', en: 'Business', ru: 'Бизнес' },
};

// Bullets deliberately carry NO credit total: `creditsIncluded` is derived from the ceilings in
// pricingConfig, so a hardcoded "150 credits" here would silently drift the moment a media cost changes.
// Engine names are Gemini-era — the old copy advertised "Runway Gen-4" to users long after Veo became the
// primary video engine.
export const TIER_FEATURES: Record<PricingTierId, Record<Lang, string[]>> = {
  // ⚠️ THIS BLOCK ONCE ARGUED THE OPPOSITE — that the card must advertise "3 უფასო ვიდეო" because
  // free_films_remaining really was 3 on every account. That was true then and is wrong now: the
  // three uncounted videos were 94% of the cost of a free signup ($2.88 of $3.06) and have been
  // folded into one 50-credit grant with a 1-video cap. Kept as a note because the underlying rule
  // has not changed — this copy must state what the DATABASE actually grants, not the other way round.
  // ⚠️ THIS CARD USED TO CONTRADICT THE DATABASE AND THE PRICING PAGE AT THE SAME TIME. It promised
  // "3 free videos + 10 starter credits" while the pricing card said 6 images (12 credits) and the signup
  // trigger actually inserted 10 — three numbers, none of which agreed, plus a video allowance that the
  // credit ledger did not know existed. One trial now: 50 credits, of which at most one video, and the
  // video cap is enforced by free_films_remaining rather than promised in copy.
  free: {
    ka: ['50 უფასო კრედიტი სასტარტოდ', 'მათ შორის 1 ვიდეო (8 წმ)', 'ან 25 სურათი / 10 მუსიკა', 'AI ჩატი (Gemini)'],
    en: ['50 free starter credits', 'including 1 video (8s)', 'or 25 images / 10 music tracks', 'AI chat (Gemini)'],
    ru: ['50 бесплатных стартовых кредитов', 'включая 1 видео (8 с)', 'или 25 изображений / 10 треков', 'AI-чат (Gemini)'],
  },
  basic: {
    ka: ['4 ვიდეო კლიპი 8 წამამდე (Veo 3.1, ნატიური აუდიო)', '40 კინემატოგრაფიული სურათი', '10 მუსიკალური ტრეკი (Lyria 3)', 'ხმის სინთეზი ქართულად'],
    en: ['4 video clips up to 8s (Veo 3.1, native audio)', '40 cinematic images', '10 music tracks (Lyria 3)', 'Georgian voice synthesis'],
    ru: ['4 видеоклипа до 8с (Veo 3.1, нативное аудио)', '40 кинематографичных изображений', '10 музыкальных треков (Lyria 3)', 'Синтез голоса на грузинском'],
  },
  pro: {
    ka: ['8 ვიდეო კლიპი (Veo 3.1)', '100 უზადო სურათი', '25 მუსიკალური ტრეკი (Lyria 3)', 'დუბლაჟი და ავატარები', 'სრული წვდომა Agent G-ზე'],
    en: ['8 video clips (Veo 3.1)', '100 flawless images', '25 music tracks (Lyria 3)', 'Dubbing & avatars', 'Full access to Agent G'],
    ru: ['8 видеоклипов (Veo 3.1)', '100 безупречных изображений', '25 музыкальных треков (Lyria 3)', 'Дубляж и аватары', 'Полный доступ к Agent G'],
  },
  // ⚠️ THESE NUMBERS MUST TRACK PRICING_TIERS[business].creditCeiling, AND ONCE THEY DID NOT. When Business
  // was rebalanced to {16, 60, 250} to give it a real per-dollar advantage over Pro, this hand-written
  // copy kept saying 200 images / 50 tracks — so the pricing PAGE advertised 250/60 while the billing
  // MODAL, the screen someone reads with their card out, advertised less. Caught by opening the modal as a
  // signed-in user, not by reading the diff. If a ceiling moves, this block moves in the same edit.
  business: {
    ka: ['16 ვიდეო კლიპი (Veo 3.1)', '250 დეტალური სურათი', '60 მუსიკალური ტრეკი (Lyria 3)', 'გუნდური ბიბლიოთეკები', 'პრიორიტეტული რენდერი', 'VIP მხარდაჭერა'],
    en: ['16 video clips (Veo 3.1)', '250 detailed images', '60 music tracks (Lyria 3)', 'Shared team libraries', 'Priority render queue', 'VIP support'],
    ru: ['16 видеоклипов (Veo 3.1)', '250 детальных изображений', '60 музыкальных треков (Lyria 3)', 'Командные библиотеки', 'Приоритетная очередь', 'VIP-поддержка'],
  },
};

type Rails = { bog: boolean; card: boolean };

export function CreditsModal({ open, locale, balanceGel, authed, onClose, onSignIn }: CreditsModalProps) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [freeFilms, setFreeFilms] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);
  // In-flight checkout: `plan:<rung id>` or `topup:<₾>` — disables every pay button while the redirect starts.
  const [busyId, setBusyId] = useState<string | null>(null);
  // null = still probing. Optimistic default for the legacy card rail mirrors WalletRefill.
  const [rails, setRails] = useState<Rails | null>(null);
  const [plan, setPlan] = useState<BogPlanSummary | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const showToast = useCallback((text: string, ok = false) => {
    setToast({ text, ok });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

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
      .catch(() => { /* fail-soft — the line just shows — */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, authed]);

  // Which rail can take a payment, and (with BOG) the plan the user already has.
  useEffect(() => {
    if (!open || !authed) return;
    let alive = true;
    fetch('/api/checkout/capabilities', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (j: { bog?: boolean; stripe?: boolean } | null) => {
        const next: Rails = { bog: Boolean(j?.bog), card: j ? Boolean(j.stripe) : true };
        if (!alive) return;
        setRails(next);
        if (next.bog) {
          const p = await fetchBogPlan();
          if (alive) setPlan(p);
        }
      })
      .catch(() => { if (alive) setRails({ bog: false, card: true }); });
    return () => { alive = false; };
  }, [open, authed]);

  // Focus moves into the sheet, Tab stays inside it, Escape closes it and focus returns to the control that opened it
  // (useDialogA11y, as AuthModal). It had Escape only: keyboard and screen-reader users tabbed out behind the backdrop.
  // `mounted` too: the sheet renders only after mount (portal), and the hook must run once the node exists.
  const dialogRef = useDialogA11y<HTMLDivElement>(open && mounted, onClose);
  // Lock body scroll while open (mirrors AuthModal).
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const bog = rails?.bog === true;
  const noRail = rails !== null && !rails.bog && !rails.card;

  /** The older card checkout, used only when BOG is not live. Returns true when it redirected or handled auth. */
  const legacyCardCheckout = useCallback(async (path: string, body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
    if (res.status === 401) { onClose(); onSignIn(); return true; }
    const j = (await res.json().catch(() => null)) as { url?: string } | null;
    if (res.ok && j?.url) { navigateToPayment(j.url); return true; }
    return false;
  }, [onClose, onSignIn]);

  const startPlan = useCallback(async (pkg: { id: PricingTierId; priceUsd: number }) => {
    if (busyId || noRail) return;
    const offer = bogPlanOffer(pkg.id);
    setBusyId(`plan:${pkg.id}`);
    track('payment_initiated', { package: pkg.id, amount: bog && offer ? offer.amountGel : pkg.priceUsd, rail: bog ? 'bog' : 'card' });
    try {
      if (bog && offer) {
        const r = await startBogCheckout({ kind: 'plan', tierId: offer.tier, locale: lang });
        if (r.ok) { navigateToPayment(r.redirectUrl); return; } // keep the spinner through the navigation
        setBusyId(null);
        if (r.reason === 'auth') { onClose(); onSignIn(); return; }
        showToast(r.reason === 'already_subscribed' ? t.alreadySubscribed : t.payError);
        return;
      }
      if (await legacyCardCheckout('/api/billing/tier-checkout', { tierId: pkg.id })) return;
      setBusyId(null);
      showToast(t.payError);
    } catch {
      setBusyId(null);
      showToast(t.payError);
    }
  }, [busyId, noRail, bog, lang, onClose, onSignIn, showToast, t.alreadySubscribed, t.payError, legacyCardCheckout]);

  const startTopup = useCallback(async (amountGel: number) => {
    if (busyId || noRail) return;
    setBusyId(`topup:${amountGel}`);
    track('payment_initiated', { package: `topup_${amountGel}`, amount: amountGel, rail: bog ? 'bog' : 'card' });
    try {
      if (bog) {
        const r = await startBogCheckout({ kind: 'topup', amountGel, locale: lang });
        if (r.ok) { navigateToPayment(r.redirectUrl); return; }
        setBusyId(null);
        if (r.reason === 'auth') { onClose(); onSignIn(); return; }
        showToast(t.payError);
        return;
      }
      if (await legacyCardCheckout('/api/billing/wallet-topup', { amountGel })) return;
      setBusyId(null);
      showToast(t.payError);
    } catch {
      setBusyId(null);
      showToast(t.payError);
    }
  }, [busyId, noRail, bog, lang, onClose, onSignIn, showToast, t.payError, legacyCardCheckout]);

  const doCancelRenewal = useCallback(async () => {
    if (canceling) return;
    setCanceling(true);
    const ok = await cancelBogRenewal();
    setCanceling(false);
    setConfirmCancel(false);
    if (!ok) { showToast(t.cancelError); return; }
    showToast(t.renewalCanceled, true);
    setPlan(await fetchBogPlan());
  }, [canceling, showToast, t.cancelError, t.renewalCanceled]);

  if (!mounted || typeof document === 'undefined' || !open) return null;

  const planDate = formatPlanDate(plan?.currentPeriodEnd, lang);

  return createPortal(
    <div
      onClick={onClose}
      // Backdrop is rgba(0,0,0,0.6) with NO blur, so the sidebar + chat stay visible (dimmed) behind the modal.
      // z-[110] keeps it above the cookie banner (z-[60]); the panel below stacks above this.
      className="fixed inset-0 z-[110] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        // Payment: a voice call may open this sheet but never press anything in it but Close (lib/voice/liveUi).
        data-live-guard="pay"
        onClick={(e) => e.stopPropagation()}
        className="relative z-[111] max-h-[90dvh] w-full max-w-[420px] overflow-y-auto overscroll-contain rounded-t-3xl border border-app-border/15 bg-app-surface shadow-[0_24px_80px_-24px_rgba(0,0,0,0.6)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-app-accent/15">
              <CreditCard size={15} className="text-app-accent" />
            </span>
            <h2 className="text-[17px] font-bold tracking-tight text-app-text">{t.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t.close}
            className="flex h-11 w-11 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text">
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
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-app-accent px-5 py-2.5 text-[14px] font-semibold text-app-bg transition-opacity hover:opacity-90">
              <LogIn size={16} /> {t.signIn}
            </button>
            <a href={`/${lang}/pricing`} className="text-[12.5px] font-medium text-app-accent underline-offset-2 hover:underline">{t.viewAllPlans}</a>
          </div>
        ) : (
          /* ── Signed-in billing body ───────────────────────────────────────── */
          <div className="px-5 pb-5 pt-4">
            {/* Balance + free videos */}
            <div className="rounded-2xl bg-app-elevated/60 px-4 py-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">{t.balance}</p>
              <p className="mt-0.5 text-[34px] font-bold leading-none tabular-nums text-app-text">{formatCreditBalance(balanceGel, locale)}</p>
              <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-app-muted">
                {/* The count only: a fixed „/ 3" read as „you used two" to every new account (the allowance is 1). */}
                🎬 {t.freeVideos}: <span className="font-semibold tabular-nums text-app-text">{loading && freeFilms === null ? <Loader2 size={12} className="inline animate-spin" /> : (freeFilms ?? '—')}</span>
              </p>
            </div>

            {/* The live BOG plan — what renews, when, on which card; cancelling is two taps and says what happens. */}
            {plan && (
              <div className="mt-4 rounded-2xl border border-app-accent/25 bg-app-accent/10 px-4 py-3" aria-live="polite">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-app-muted">{t.yourPlan}</p>
                <p className="mt-0.5 text-[15px] font-bold text-app-text">{planName(plan.tier, lang)}</p>
                <p className="mt-0.5 text-[12px] text-app-muted">
                  {plan.autoRenew ? t.renewsOn(planDate) : t.activeUntil(planDate)}
                  {plan.cardMask ? ` · •••• ${plan.cardMask.slice(-4)}` : ''}
                </p>
                {plan.autoRenew && !confirmCancel && (
                  <button type="button" onClick={() => setConfirmCancel(true)}
                    className="mt-1.5 min-h-[44px] text-[12.5px] font-medium text-app-muted underline underline-offset-2 hover:text-app-text">
                    {t.cancelRenewal}
                  </button>
                )}
                {confirmCancel && (
                  <div className="mt-2">
                    <p className="text-[12.5px] leading-snug text-app-text">{t.cancelConfirm(planDate)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void doCancelRenewal()} disabled={canceling}
                        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-app-elevated px-3.5 text-[12.5px] font-semibold text-app-text ring-1 ring-app-border/20 disabled:opacity-60">
                        {canceling && <Loader2 size={13} className="animate-spin" />} {t.yesCancel}
                      </button>
                      <button type="button" onClick={() => setConfirmCancel(false)} disabled={canceling}
                        className="inline-flex min-h-[44px] items-center rounded-xl bg-app-accent px-3.5 text-[12.5px] font-semibold text-app-bg disabled:opacity-60">
                        {t.keep}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Monthly plans. With BOG the price is the ₾ amount BOG charges each month; the $ figure is for reference. */}
            <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{t.plansTitle}</p>
            <div className="space-y-3">
              {PACKAGES.map((p) => {
                const offer = bogPlanOffer(p.id);
                const highlight = p.id === 'pro';
                const isCurrent = Boolean(plan && offer && plan.tier === offer.tier);
                const busy = busyId === `plan:${p.id}`;
                const disabled = busyId !== null || noRail || isCurrent || rails === null;
                const main = bog && offer ? `${offer.amountGel} ₾` : `$${p.priceUsd}`;
                const sub = bog ? `≈ $${p.priceUsd}` : `≈ ${p.priceGel} ₾`;
                return (
                  // ⚠️ THE WHOLE CARD IS THE TARGET, NOT JUST THE BUTTON. On a phone the button is a ~46px strip at the
                  // bottom of a ~200px card; everything above it looked tappable and did nothing. The inner <button>
                  // stays the ACCESSIBLE control and stops its own click from bubbling, so exactly one checkout starts.
                  <div key={p.id}
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-disabled={disabled}
                    onClick={() => { if (!disabled) void startPlan(p); }}
                    onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !disabled) { e.preventDefault(); void startPlan(p); } }}
                    aria-label={`${TIER_NAME[p.id][lang]} — ${main} ${t.perMonth}`}
                    // All three share one frame and one elevation; only the badge marks the popular tier.
                    className={`relative min-w-0 rounded-2xl border bg-app-elevated p-4 transition-transform ${isCurrent ? 'border-app-accent/40' : 'border-app-border/15'} ${disabled ? '' : 'cursor-pointer active:scale-[0.99]'}`}
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgb(var(--app-accent) / 0.14), 0 22px 48px -26px rgb(var(--app-accent-deep) / 0.45)' }}>
                    {(highlight || isCurrent) && (
                      <span className="absolute -top-2.5 left-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-1 overflow-hidden whitespace-nowrap rounded-full px-2.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-app-bg"
                        style={{ background: 'linear-gradient(180deg, rgb(var(--app-accent)), rgb(var(--app-accent-deep)))', boxShadow: '0 6px 16px -5px rgb(var(--app-accent) / 0.6)' }}>
                        {isCurrent ? <Check size={10} strokeWidth={3} /> : <Sparkles size={10} strokeWidth={2.6} />} {isCurrent ? t.currentPlan : t.popular}
                      </span>
                    )}
                    {/* Name left, price right — the NAME wraps and the price never splits. */}
                    <div className="flex min-w-0 items-baseline justify-between gap-3">
                      <span className="min-w-0 break-words text-[14.5px] font-bold leading-snug tracking-tight text-app-text">{TIER_NAME[p.id][lang]}</span>
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="whitespace-nowrap text-[21px] font-black leading-none tabular-nums text-app-text">{main}<span className="ml-1 text-[11px] font-medium text-app-muted">{t.perMonth}</span></span>
                        <span className="mt-1 text-[10.5px] font-medium tabular-nums text-app-muted">{sub}</span>
                      </span>
                    </div>
                    {offer && <p className="mt-2 text-[12px] font-semibold text-app-accent">{t.monthlyCredits(offer.credits)}</p>}
                    <ul className="mt-2.5 space-y-1.5">
                      {TIER_FEATURES[p.id][lang].map((f) => (
                        <li key={f} className="flex min-w-0 items-start gap-2 text-[12px] leading-snug text-app-text/80">
                          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full" style={{ background: 'rgb(var(--app-accent) / 0.14)' }}>
                            <Check size={11} strokeWidth={3} className="text-app-accent" />
                          </span>
                          <span className="min-w-0 [overflow-wrap:anywhere]">{f}</span>
                        </li>
                      ))}
                    </ul>
                    <button type="button" onClick={(e) => { e.stopPropagation(); void startPlan(p); }} disabled={disabled}
                      className="mt-3.5 inline-flex min-h-[46px] w-full min-w-0 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-app-accent px-3 py-2 text-center text-[13px] font-semibold leading-snug text-app-bg transition-opacity hover:opacity-90 disabled:opacity-60">
                      {busy
                        ? <><Loader2 size={13} className="animate-spin" /> {bog ? t.redirectingBog : t.redirecting}</>
                        : isCurrent
                          ? <>{plan?.autoRenew ? t.renewsOn(planDate) : t.activeUntil(planDate)}</>
                          : bog && offer
                            ? <>{t.subscribe} · {offer.amountGel} ₾ {t.perMonth}</>
                            : <>{t.pay} · ${p.priceUsd}</>}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* PAYG top-ups — credits that never expire, no plan needed. */}
            <p className="mb-2 mt-5 text-[12px] font-semibold uppercase tracking-wider text-app-muted">{t.topupTitle}</p>
            <div className="grid grid-cols-3 gap-2">
              {BOG_TOPUP_PACKS_GEL.map((g) => (
                <button key={g} type="button" onClick={() => void startTopup(g)} disabled={busyId !== null || noRail || rails === null}
                  aria-label={`${g} ₾ — ${topupCredits(g)} ${t.credits}`}
                  className="flex min-h-[56px] min-w-0 touch-manipulation flex-col items-center justify-center rounded-xl border border-app-border/15 bg-app-elevated px-2 py-2 text-app-text transition hover:border-app-border/30 disabled:opacity-60">
                  {busyId === `topup:${g}` ? <Loader2 size={16} className="animate-spin" /> : (
                    <>
                      <span className="text-[15px] font-bold tabular-nums">{g} ₾</span>
                      <span className="text-[11px] tabular-nums text-app-muted">{topupCredits(g)} {t.credits}</span>
                    </>
                  )}
                </button>
              ))}
            </div>

            {/* Only once the rail is known — a "card checkout" line flashing before "Bank of Georgia" reads as a switch. */}
            {rails !== null && (
              <p className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 text-center text-[10.5px] ${noRail ? 'text-rose-500' : 'text-app-muted'}`}>
                {!noRail && <ShieldCheck size={12} className="shrink-0" />}
                {noRail ? t.unavailable : bog ? t.secureBog : t.cardHint}
              </p>
            )}
          </div>
        )}

        {/* PHASE 39.5 (Master Contract V2) — legal-compliance links, always visible at the bottom of the
            billing modal (a mandatory checklist item for the Georgian bank e-commerce approval).

            ⚠️ THESE USED TO OPEN IN A NEW TAB AND IT WAS REPORTED AS "these buttons go somewhere completely
            different". On a phone `target="_blank"` does not read as "opened in a background tab" — the
            whole screen is replaced by a page with different chrome, the back gesture does not return you,
            and you are left managing Safari tabs mid-payment. The original reasoning ("so the user never
            loses their place in the studio") is a DESKTOP intuition; on mobile the new tab IS the way you
            lose your place. Same-tab navigation restores the back gesture, and the bottom nav on those
            pages now leads back to the chat, so there is a way home either way. */}
        <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 px-5 pb-4 pt-1 text-[11px]">
          {[
            { href: `/${lang}/terms`, label: lang === 'en' ? 'Terms' : lang === 'ru' ? 'Условия' : 'პირობები' },
            // 'დაბრუნება' alone is the Georgian for "go back" — read as a back button next to a payment
            // form, which is the worst possible place to mislead someone. See ChatViews for the report.
            { href: `/${lang}/refund`, label: lang === 'en' ? 'Refunds' : lang === 'ru' ? 'Возврат' : 'თანხის დაბრუნება' },
            { href: `/${lang}/privacy`, label: lang === 'en' ? 'Privacy' : lang === 'ru' ? 'Приватность' : 'კონფიდენციალურობა' },
          ].map((l) => (
            <a key={l.href} href={l.href}
              className="text-app-muted underline-offset-2 transition-colors hover:text-app-text hover:underline">{l.label}</a>
          ))}
        </div>

        {/* Self-contained toast (no ToastProvider in this tree) */}
        {toast && (
          <div role="status" className="mx-5 mb-5 flex items-center gap-2 rounded-xl bg-app-elevated px-3.5 py-2.5 text-[12.5px] font-medium text-app-text ring-1 ring-app-border/15">
            {toast.ok
              ? <Check size={14} className="shrink-0 text-emerald-500" />
              : <AlertCircle size={14} className="shrink-0 text-rose-400" />} {toast.text}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default CreditsModal;
