'use client';

import { useEffect, useMemo } from 'react';
import { Menu } from 'lucide-react';
import CommandCenterChat from './CommandCenterChat';
import { useOmniDashboardStore } from './store';
import type { ServiceId } from './types';
import { normalizeOmniLocale, type OmniLocale } from './i18n';

interface MainDashboardProps {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
}

const DASHBOARD_COPY = {
  ka: {
    welcome: 'გამარჯობა გიორგი, რით შემიძლია დაგეხმარო?',
    subtitle: 'აირჩიე სწრაფი მოქმედება ან დაწერე საკუთარი დავალება ქვედა ბარში.',
    pillsTitle: 'სწრაფი სერვისები',
    menuLabel: 'სერვის-ჰაბის გახსნა',
  },
  en: {
    welcome: 'Hello Giorgi, how can I help you?',
    subtitle: 'Pick a quick action or write a custom instruction in the bottom bar.',
    pillsTitle: 'Quick services',
    menuLabel: 'Open service hub',
  },
  ru: {
    welcome: 'Привет, Георгий. Чем могу помочь?',
    subtitle: 'Выберите быстрое действие или напишите задачу в нижней панели.',
    pillsTitle: 'Быстрые сервисы',
    menuLabel: 'Открыть хаб сервисов',
  },
} as const;

const QUICK_ACTIONS: Record<OmniLocale, Array<{ serviceId: ServiceId; icon: string; label: string; prompt: string }>> = {
  ka: [
    {
      serviceId: 'image-gen',
      icon: '🖼️',
      label: 'სურათის შექმნა',
      prompt: 'შექმენი სარეკლამო სურათი მაღალი დეტალით, modern glassmorphism სტილით და მკაფიო ბრენდული აქცენტით.',
    },
    {
      serviceId: 'voice-synth',
      icon: '🎙️',
      label: 'ხმის სინთეზი',
      prompt: 'დამიგენერირე ბუნებრივი ქართული გახმოვანება მოკლე ტექსტზე, ემოციური მაგრამ პროფესიული ტონით.',
    },
    {
      serviceId: 'video-gen',
      icon: '🎬',
      label: 'ვიდეოს გენერირება',
      prompt: 'მომიმზადე 15-წამიანი ვიდეო კონცეფცია სცენარით, კადრებით და რიტმით სოციალური მედიისთვის.',
    },
    {
      serviceId: 'business-strategy',
      icon: '📊',
      label: 'ბიზნეს სტრატეგია',
      prompt: 'შემიქმენი 30-დღიანი ბიზნეს სტრატეგია KPI-ებით, პრიორიტეტებით და ეტაპობრივი შესრულების გეგმით.',
    },
  ],
  en: [
    {
      serviceId: 'image-gen',
      icon: '🖼️',
      label: 'Create Image',
      prompt: 'Generate a premium campaign visual with sharp detail and clean brand composition.',
    },
    {
      serviceId: 'voice-synth',
      icon: '🎙️',
      label: 'Voice Synthesis',
      prompt: 'Create natural voice narration in a polished executive tone from a short script.',
    },
    {
      serviceId: 'video-gen',
      icon: '🎬',
      label: 'Generate Video',
      prompt: 'Create a 15-second video concept with storyboard beats and pacing for social media.',
    },
    {
      serviceId: 'business-strategy',
      icon: '📊',
      label: 'Business Strategy',
      prompt: 'Build a 30-day business strategy with KPI targets, priorities, and phased execution.',
    },
  ],
  ru: [
    {
      serviceId: 'image-gen',
      icon: '🖼️',
      label: 'Создать изображение',
      prompt: 'Создай рекламный визуал премиум-уровня с чистой композицией и высоким качеством.',
    },
    {
      serviceId: 'voice-synth',
      icon: '🎙️',
      label: 'Синтез голоса',
      prompt: 'Сгенерируй естественную озвучку в деловом тоне по короткому тексту.',
    },
    {
      serviceId: 'video-gen',
      icon: '🎬',
      label: 'Генерация видео',
      prompt: 'Подготовь концепт 15-секундного видео со структурой сцен и ритмом.',
    },
    {
      serviceId: 'business-strategy',
      icon: '📊',
      label: 'Бизнес-стратегия',
      prompt: 'Сформируй 30-дневную бизнес-стратегию с KPI, приоритетами и пошаговым планом.',
    },
  ],
};

export default function MainDashboard({ locale, userName, isAuthenticated }: MainDashboardProps) {
  const localeCode = normalizeOmniLocale(locale);
  const copy = DASHBOARD_COPY[localeCode];

  const chatMessages = useOmniDashboardStore((state) => state.chatMessages);
  const setLocale = useOmniDashboardStore((state) => state.setLocale);
  const setAuthSnapshot = useOmniDashboardStore((state) => state.setAuthSnapshot);
  const setActiveService = useOmniDashboardStore((state) => state.setActiveService);

  const quickActions = useMemo(() => QUICK_ACTIONS[localeCode], [localeCode]);
  const showWelcome = chatMessages.length === 0;

  useEffect(() => {
    setLocale(locale);
  }, [locale, setLocale]);

  useEffect(() => {
    setAuthSnapshot({
      status: isAuthenticated ? 'authenticated' : 'guest',
      displayName: userName,
      tierLabel: isAuthenticated ? 'Executive' : 'Guest',
    });
  }, [isAuthenticated, setAuthSnapshot, userName]);

  const handleQuickAction = (serviceId: ServiceId, prompt: string) => {
    setActiveService(serviceId);
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new CustomEvent('omni:seed-command', { detail: { serviceId, prompt } }));
  };

  const openServiceHub = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.dispatchEvent(new CustomEvent('omni:open-service-hub'));
  };

  return (
    <div className="command-center-shell h-full w-full overflow-hidden">
      <div className="command-center-frame flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/14">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="absolute left-3 top-3 z-30 sm:left-5 sm:top-5">
            <button
              type="button"
              aria-label={copy.menuLabel}
              onClick={openServiceHub}
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.07] text-white/80 backdrop-blur-xl transition hover:border-cyan-200/45 hover:text-cyan-100"
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>

          <section
            className={`command-center-welcome px-4 pt-6 text-center sm:px-6 sm:pt-8 ${showWelcome ? 'is-visible' : 'is-condensed'}`}
          >
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">{copy.pillsTitle}</p>
            <h1 className="mx-auto max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
              {copy.welcome}
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-white/62 sm:text-base">{copy.subtitle}</p>

            <div className="command-center-pills mx-auto mt-6 flex w-full max-w-3xl flex-wrap items-center justify-center gap-2 sm:mt-7 sm:gap-2.5">
              {quickActions.map((action) => (
                <button
                  key={action.serviceId}
                  type="button"
                  onClick={() => handleQuickAction(action.serviceId, action.prompt)}
                  className="command-center-pill inline-flex min-h-[48px] items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-white/92"
                >
                  <span aria-hidden className="text-base">{action.icon}</span>
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="min-h-0 flex-1">
            <CommandCenterChat />
          </div>
        </div>
      </div>
    </div>
  );
}
