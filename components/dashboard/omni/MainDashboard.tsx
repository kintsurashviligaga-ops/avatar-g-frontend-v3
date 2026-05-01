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
      serviceId: 'avatar',
      icon: '🧑',
      label: 'ავატარი',
      prompt: 'შემიქმენი პრემიუმ ავატარი პროფესიული სტილით, მკაფიო განათებით და ძლიერი პერსონით.',
    },
    {
      serviceId: 'image',
      icon: '🖼️',
      label: 'სურათის შექმნა',
      prompt: 'შექმენი სარეკლამო სურათი მაღალი დეტალით, modern glassmorphism სტილით და მკაფიო ბრენდული აქცენტით.',
    },
    {
      serviceId: 'video',
      icon: '🎬',
      label: 'ვიდეოს გენერირება',
      prompt: 'მომიმზადე 15-წამიანი ვიდეო კონცეფცია სცენარით, კადრებით და რიტმით სოციალური მედიისთვის.',
    },
    {
      serviceId: 'terminal-coding',
      icon: '💻',
      label: 'ტერმინალი და კოდინგი',
      prompt: 'შემიდგინე ტერმინალის ნაბიჯები და კოდის სტრუქტურა, რომ ამოცანა production-ready შესრულდეს.',
    },
  ],
  en: [
    {
      serviceId: 'avatar',
      icon: '🧑',
      label: 'Avatar',
      prompt: 'Create a premium avatar portrait with clean lighting and a confident professional identity.',
    },
    {
      serviceId: 'image',
      icon: '🖼️',
      label: 'Create Image',
      prompt: 'Generate a premium campaign visual with sharp detail and clean brand composition.',
    },
    {
      serviceId: 'video',
      icon: '🎬',
      label: 'Generate Video',
      prompt: 'Create a 15-second video concept with storyboard beats and pacing for social media.',
    },
    {
      serviceId: 'terminal-coding',
      icon: '💻',
      label: 'Terminal & Coding',
      prompt: 'Provide terminal-first implementation steps and production-ready code structure for this task.',
    },
  ],
  ru: [
    {
      serviceId: 'avatar',
      icon: '🧑',
      label: 'Аватар',
      prompt: 'Создай премиальный аватар с чистым светом и выразительной профессиональной подачей.',
    },
    {
      serviceId: 'image',
      icon: '🖼️',
      label: 'Создать изображение',
      prompt: 'Создай рекламный визуал премиум-уровня с чистой композицией и высоким качеством.',
    },
    {
      serviceId: 'video',
      icon: '🎬',
      label: 'Генерация видео',
      prompt: 'Подготовь концепт 15-секундного видео со структурой сцен и ритмом.',
    },
    {
      serviceId: 'terminal-coding',
      icon: '💻',
      label: 'Терминал и кодинг',
      prompt: 'Составь терминальные шаги и структуру production-кода для решения задачи.',
    },
  ],
};

export default function MainDashboard({ locale, userName, isAuthenticated }: MainDashboardProps) {
  const storeLocale = useOmniDashboardStore((state) => state.locale);
  const localeCode = normalizeOmniLocale(storeLocale || locale);
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
