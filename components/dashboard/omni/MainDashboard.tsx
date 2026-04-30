'use client';

import { useEffect, useMemo } from 'react';
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
    welcome: 'რით შემიძლია დაგეხმარო?',
    subtitle: 'აირჩიე სწრაფი მოქმედება ან დაწერე საკუთარი დავალება ქვედა ბარში.',
    pillsTitle: 'სწრაფი სერვისები',
  },
  en: {
    welcome: 'How can I help you?',
    subtitle: 'Pick a quick action or write a custom instruction in the bottom bar.',
    pillsTitle: 'Quick services',
  },
  ru: {
    welcome: 'Чем могу помочь?',
    subtitle: 'Выберите быстрое действие или напишите задачу в нижней панели.',
    pillsTitle: 'Быстрые сервисы',
  },
} as const;

const QUICK_ACTIONS: Record<OmniLocale, Array<{ serviceId: ServiceId; icon: string; label: string; prompt: string }>> = {
  ka: [
    {
      serviceId: 'business-strategy',
      icon: '🧠',
      label: 'სტრატეგიული გეგმა',
      prompt: 'შემიქმენი 30-დღიანი ზრდის სტრატეგია KPI-ებით, პრიორიტეტებით და კონკრეტული ნაბიჯებით.',
    },
    {
      serviceId: 'video-gen',
      icon: '🎬',
      label: 'ვიდეო კონცეფცია',
      prompt: 'შექმენი მოკლე ვიდეო კონცეფცია: სცენარი, კადრების გეგმა და ტონი ქართულ აუდიტორიაზე.',
    },
    {
      serviceId: 'image-gen',
      icon: '🖼️',
      label: 'ვიზუალური პაკეტი',
      prompt: 'მომიმზადე სარეკლამო ვიზუალების პაკეტი: მთავარი ბანერი, სოციალური პოსტი და ვიზუალური მიმართულება.',
    },
    {
      serviceId: 'analytics-hub',
      icon: '📊',
      label: 'აღმასრულებელი შეჯამება',
      prompt: 'გააკეთე აღმასრულებელი შეჯამება მიმდინარე მდგომარეობაზე: რა მუშაობს, რა რისკია და რა ქმედებაა საჭირო.',
    },
  ],
  en: [
    {
      serviceId: 'business-strategy',
      icon: '🧠',
      label: 'Strategic Plan',
      prompt: 'Create a 30-day growth strategy with KPIs, priorities, and clear execution steps.',
    },
    {
      serviceId: 'video-gen',
      icon: '🎬',
      label: 'Video Concept',
      prompt: 'Build a short-form video concept with scene plan, voice direction, and target tone.',
    },
    {
      serviceId: 'image-gen',
      icon: '🖼️',
      label: 'Visual Pack',
      prompt: 'Prepare a visual campaign pack: hero art, social variation, and style direction.',
    },
    {
      serviceId: 'analytics-hub',
      icon: '📊',
      label: 'Executive Brief',
      prompt: 'Provide an executive summary of current performance, key risks, and next actions.',
    },
  ],
  ru: [
    {
      serviceId: 'business-strategy',
      icon: '🧠',
      label: 'Стратегический план',
      prompt: 'Сформируй 30-дневную стратегию роста с KPI, приоритетами и конкретными шагами.',
    },
    {
      serviceId: 'video-gen',
      icon: '🎬',
      label: 'Концепт видео',
      prompt: 'Подготовь концепт короткого видео: сцены, подача, тон и формат.',
    },
    {
      serviceId: 'image-gen',
      icon: '🖼️',
      label: 'Визуальный пакет',
      prompt: 'Собери пакет визуалов: главный баннер, вариант для соцсетей и стиль.',
    },
    {
      serviceId: 'analytics-hub',
      icon: '📊',
      label: 'Executive-сводка',
      prompt: 'Сделай executive-сводку по метрикам, рискам и следующим действиям.',
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

  return (
    <div className="command-center-shell h-full w-full overflow-hidden">
      <div className="command-center-frame flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] border border-white/14">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
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
