'use client';

/**
 * WelcomeOnboarding — a 3-step first-login welcome (PHASE 3 Task 2).
 *
 * Step 1 welcomes + shows what the platform does; Step 2 lets the user pick a
 * service; Step 3 highlights the 3 free videos + balance and launches the chosen
 * panel by dispatching the existing `omni:set-mode` window event (which OmniStudio
 * listens for). Completion is stored in localStorage (`myavatar:welcomed`) so it
 * never shows again on this device — no migration needed. Leaves the separate
 * avatar-naming onboarding untouched. Mobile-first, Georgian default.
 */

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Film, Music2, ImageIcon, Sparkles, ArrowRight } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';
type Service = 'video' | 'music' | 'image';

const COPY: Record<Lang, {
  s1Title: string; s1Sub: string; start: string;
  s2Title: string; video: string; music: string; image: string; videoSub: string; musicSub: string; imageSub: string;
  s3Title: string; s3Sub: string; balance: string; createFirst: string; skip: string;
}> = {
  ka: {
    s1Title: 'MyAvatar-ში კეთილი იყოს თქვენი მობრძანება! 👋',
    s1Sub: 'შექმენი AI ვიდეო, მუსიკა და სურათები — წამებში.',
    start: 'დაწყება',
    s2Title: 'რა გინდა შექმნა?',
    video: 'ვიდეო', music: 'მუსიკა', image: 'სურათი',
    videoSub: 'კინო და რეკლამა', musicSub: 'სიმღერა და ბითი', imageSub: 'ილუსტრაცია',
    s3Title: '3 უფასო ვიდეო გელოდება! 🎬',
    s3Sub: 'დაიწყე ახლავე — პირველი ვიდეო უფასოა.',
    balance: 'ბალანსი', createFirst: 'პირველი ვიდეოს შექმნა', skip: 'გამოტოვება',
  },
  en: {
    s1Title: 'Welcome to MyAvatar! 👋',
    s1Sub: 'Create AI video, music and images — in seconds.',
    start: 'Get started',
    s2Title: 'What do you want to create?',
    video: 'Video', music: 'Music', image: 'Image',
    videoSub: 'Films & ads', musicSub: 'Songs & beats', imageSub: 'Illustration',
    s3Title: '3 free videos are waiting! 🎬',
    s3Sub: 'Start now — your first video is on us.',
    balance: 'Balance', createFirst: 'Create my first video', skip: 'Skip',
  },
  ru: {
    s1Title: 'Добро пожаловать на MyAvatar! 👋',
    s1Sub: 'Создавайте AI видео, музыку и изображения — за секунды.',
    start: 'Начать',
    s2Title: 'Что вы хотите создать?',
    video: 'Видео', music: 'Музыка', image: 'Фото',
    videoSub: 'Фильмы и реклама', musicSub: 'Песни и биты', imageSub: 'Иллюстрации',
    s3Title: 'Вас ждут 3 бесплатных видео! 🎬',
    s3Sub: 'Начните сейчас — первое видео бесплатно.',
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

  const SERVICES: { id: Service; Icon: typeof Film; label: string; sub: string }[] = [
    { id: 'video', Icon: Film, label: t.video, sub: t.videoSub },
    { id: 'music', Icon: Music2, label: t.music, sub: t.musicSub },
    { id: 'image', Icon: ImageIcon, label: t.image, sub: t.imageSub },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <div role="dialog" aria-modal="true"
        className="relative w-full max-w-[440px] overflow-hidden rounded-3xl border border-app-border/15 bg-app-surface shadow-[0_30px_90px_-20px_rgba(56,189,248,0.4)]">
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
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white"><Sparkles size={26} /></span>
              <h2 className="text-[19px] font-bold leading-tight text-app-text">{t.s1Title}</h2>
              <p className="text-[13.5px] text-app-muted">{t.s1Sub}</p>
              <div className="grid w-full grid-cols-3 gap-2 pt-1">
                {SERVICES.map(({ id, Icon, label }) => (
                  <div key={id} className="flex flex-col items-center gap-1.5 rounded-2xl border border-app-border/15 bg-app-bg/40 p-3">
                    <Icon size={20} className="text-app-accent" />
                    <span className="text-[11.5px] font-medium text-app-text">{label}</span>
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
                {SERVICES.map(({ id, Icon, label, sub }) => (
                  <button key={id} type="button" onClick={() => { setService(id); setStep(3); }}
                    className="flex items-center gap-3 rounded-2xl border border-app-border/20 bg-app-bg/40 p-4 text-left transition hover:border-app-accent/50 hover:bg-app-accent/5 active:scale-[0.99]">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent"><Icon size={22} /></span>
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
              <span className="text-4xl">🎬</span>
              <h2 className="text-[18px] font-bold leading-tight text-app-text">{t.s3Title}</h2>
              <p className="text-[13px] text-app-muted">{t.s3Sub}</p>
              <div className="w-full rounded-2xl bg-app-elevated/60 px-4 py-3">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-app-muted">{t.balance}</p>
                <p className="mt-0.5 text-[26px] font-bold tabular-nums text-app-text">{(balanceGel ?? 0).toFixed(2)} ₾</p>
              </div>
              <button type="button" onClick={() => finish(service)}
                className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent py-3 text-[14px] font-semibold text-app-bg transition hover:opacity-90">
                <Sparkles size={16} /> {service === 'video' ? t.createFirst : `${t.start} · ${SERVICES.find((s) => s.id === service)?.label}`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
