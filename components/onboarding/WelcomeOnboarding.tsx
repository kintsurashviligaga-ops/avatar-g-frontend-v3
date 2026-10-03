'use client';

/**
 * WelcomeOnboarding — a 3-step first-login welcome (PHASE 3 Task 2).
 *
 * Step 1 welcomes + shows what the platform does; Step 2 lets the user pick a
 * service; Step 3 highlights the 50-credit trial + balance and launches the chosen
 * panel by dispatching the existing `omni:set-mode` window event (which OmniStudio
 * listens for). Completion is stored in localStorage (`myavatar:welcomed`) so it
 * never shows again on this device — no migration needed. Leaves the separate
 * avatar-naming onboarding untouched. Mobile-first, Georgian default.
 */

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { X, Sparkles, ArrowRight } from 'lucide-react';
import { formatWalletBalance } from '@/lib/billing/gel';
import { BRAND_V1 } from '@/lib/brand/v1';

type Lang = 'ka' | 'en' | 'ru';
type Service = 'video' | 'music' | 'image';

const COPY: Record<Lang, {
  s1Title: string; s1Sub: string; start: string;
  s2Title: string; video: string; music: string; image: string; videoSub: string; musicSub: string; imageSub: string;
  s3Title: string; s3Sub: string; balance: string; createFirst: string; skip: string;
}> = {
  ka: {
    s1Title: 'MyAvatar-ში კეთილი იყოს თქვენი მობრძანება!',
    s1Sub: 'შექმენი AI ვიდეო, მუსიკა და სურათები — წამებში.',
    start: 'დაწყება',
    s2Title: 'რა გინდა შექმნა?',
    video: 'ვიდეო', music: 'მუსიკა', image: 'სურათი',
    videoSub: 'კინო და რეკლამა', musicSub: 'სიმღერა და ბითი', imageSub: 'ილუსტრაცია',
    s3Title: '50 უფასო კრედიტი გელოდება!',
    s3Sub: 'დაიწყე ახლავე — მათ შორის 1 უფასო ვიდეო.',
    balance: 'ბალანსი', createFirst: 'პირველი ვიდეოს შექმნა', skip: 'გამოტოვება',
  },
  en: {
    s1Title: 'Welcome to MyAvatar!',
    s1Sub: 'Create AI video, music and images — in seconds.',
    start: 'Get started',
    s2Title: 'What do you want to create?',
    video: 'Video', music: 'Music', image: 'Image',
    videoSub: 'Films & ads', musicSub: 'Songs & beats', imageSub: 'Illustration',
    s3Title: '50 free credits are waiting!',
    s3Sub: 'Start now — one video is on us.',
    balance: 'Balance', createFirst: 'Create my first video', skip: 'Skip',
  },
  ru: {
    s1Title: 'Добро пожаловать на MyAvatar!',
    s1Sub: 'Создавайте AI видео, музыку и изображения — за секунды.',
    start: 'Начать',
    s2Title: 'Что вы хотите создать?',
    video: 'Видео', music: 'Музыка', image: 'Фото',
    videoSub: 'Фильмы и реклама', musicSub: 'Песни и биты', imageSub: 'Иллюстрации',
    s3Title: 'Вас ждут 50 бесплатных кредитов!',
    s3Sub: 'Начните сейчас — включая 1 бесплатное видео.',
    balance: 'Баланс', createFirst: 'Создать первое видео', skip: 'Пропустить',
  },
};

export default function WelcomeOnboarding({ locale, balanceGel, onComplete }: {
  locale: string;
  balanceGel: number | null;
  /** Called when the user finishes/skips — the host persists + hides the modal. */
  onComplete: () => void;
}) {
  const lang: Lang = locale === 'en' ? 'en' : locale === 'ru' ? 'ru' : 'ka';
  const t = COPY[lang];

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [service, setService] = useState<Service>('video');
  useEffect(() => setMounted(true), []);

  const finish = useCallback((launch: Service | null) => {
    try { localStorage.setItem('myavatar:welcomed', '1'); } catch { /* ignore */ }
    if (launch) {
      try { window.dispatchEvent(new CustomEvent('omni:set-mode', { detail: launch })); } catch { /* ignore */ }
    }
    onComplete();
  }, [onComplete]);

  if (!mounted || typeof document === 'undefined') return null;

  // Each service is shown by its brand/v1 card still (docs/DESIGN.md §4 — the landing's own art), not an icon in a box: the
  // welcome is the first screen a new account sees, so it should look like the studio, not like a settings list.
  const SERVICES: { id: Service; art: string; label: string; sub: string }[] = [
    { id: 'video', art: BRAND_V1.cards.video.src, label: t.video, sub: t.videoSub },
    { id: 'music', art: BRAND_V1.cards.music.src, label: t.music, sub: t.musicSub },
    { id: 'image', art: BRAND_V1.cards.image.src, label: t.image, sub: t.imageSub },
  ];
  const chosen = SERVICES.find((s) => s.id === service) ?? SERVICES[0]!;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <div role="dialog" aria-modal="true"
        className="relative w-full max-w-[440px] overflow-hidden rounded-3xl border border-app-border/15 bg-app-surface shadow-[0_30px_90px_-20px_rgba(0,0,0,0.85)]">
        {/* Skip / close */}
        <button type="button" onClick={() => finish(null)} aria-label={t.skip}
          className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full text-app-muted transition hover:bg-app-elevated hover:text-app-text">
          <X size={17} />
        </button>

        {/* Step dots */}
        <div className="flex justify-center gap-1.5 pt-5">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-1.5 rounded-full transition-all ${step === n ? 'w-5 bg-app-accent' : 'w-1.5 bg-app-border/40'}`} />
          ))}
        </div>

        <div className="px-6 pb-6 pt-4">
          {step === 1 && (
            <div className="flex flex-col items-center gap-4 text-center">
              {/* The rocket — the transparent brand mark (§8), not a gradient tile with a sparkle. */}
              <span className="relative h-14 w-14"><Image src="/brand/rocket-mark.png" alt="" fill sizes="56px" className="object-contain" /></span>
              <h2 className="text-[19px] font-bold leading-tight text-app-text">{t.s1Title}</h2>
              <p className="text-[13.5px] text-app-muted">{t.s1Sub}</p>
              <div className="grid w-full grid-cols-3 gap-2 pt-1">
                {SERVICES.map(({ id, art, label }) => (
                  <div key={id} data-testid={`welcome-tile-${id}`} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-app-elevated ring-1 ring-app-border/10">
                    <Image src={art} alt="" fill sizes="136px" className="object-cover" />
                    <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
                    <span className="absolute inset-x-0 bottom-0 p-2 text-[12px] font-semibold text-white">{label}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setStep(2)}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent py-3 text-[14px] font-semibold text-app-bg transition hover:opacity-90">
                {t.start} <ArrowRight size={16} />
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-center text-[18px] font-bold text-app-text">{t.s2Title}</h2>
              <div className="flex flex-col gap-2.5">
                {SERVICES.map(({ id, art, label, sub }) => (
                  <button key={id} type="button" onClick={() => { setService(id); setStep(3); }}
                    className="flex items-center gap-3 rounded-2xl border border-app-border/20 bg-app-bg/40 p-3 text-left transition hover:border-app-border/40 hover:bg-app-elevated/60 active:scale-[0.99]">
                    {/* A hairline on hover, never a coloured border (§2). */}
                    <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-app-elevated"><Image src={art} alt="" fill sizes="56px" className="object-cover" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-semibold text-app-text">{label}</span>
                      <span className="block text-[11.5px] text-app-muted">{sub}</span>
                    </span>
                    <ArrowRight size={17} className="shrink-0 text-app-muted" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center gap-4 text-center">
              {/* The chosen service's still, where an emoji (🎬 🎵 🖼️) used to stand. */}
              <span data-testid="welcome-chosen-art" className="relative h-28 w-full overflow-hidden rounded-2xl bg-app-elevated">
                <Image src={chosen.art} alt="" fill sizes="392px" className="object-cover" />
              </span>
              {service === 'video' ? (
                <>
                  <h2 className="text-[18px] font-bold leading-tight text-app-text">{t.s3Title}</h2>
                  <p className="text-[13px] text-app-muted">{t.s3Sub}</p>
                </>
              ) : (
                <h2 className="text-[18px] font-bold leading-tight text-app-text">{chosen.label}</h2>
              )}
              <div className="w-full rounded-2xl bg-app-elevated/60 px-4 py-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-app-muted">{t.balance}</p>
                <p className="mt-0.5 text-[26px] font-bold tabular-nums text-app-text">{formatWalletBalance(balanceGel, locale)}</p>
              </div>
              <button type="button" onClick={() => finish(service)}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent py-3 text-[14px] font-semibold text-app-bg transition hover:opacity-90">
                <Sparkles size={16} /> {service === 'video' ? t.createFirst : `${t.start} · ${chosen.label}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
