'use client';

import { PanelLeftClose, PanelLeftOpen, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceDefinition, ServiceMode, SupportedLocale } from '@/types/dashboard';

const FALLBACK_META: ServiceDefinition = {
  id: 'agent-g',
  icon: Sparkles,
  accent: 'from-cyan-500 to-indigo-600',
  group: 'featured',
  cost: 0,
  label: { en: 'Dashboard', ka: 'დეშბორდი', ru: 'Дашборд' },
  description: {
    en: 'Connected one-window workspace.',
    ka: 'დაკავშირებული ერთი ფანჯრის სამუშაო სივრცე.',
    ru: 'Связанное рабочее пространство в одном окне.',
  },
  related: [],
  searchTerms: ['dashboard'],
};

interface TopNavbarProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  openingLabel?: string;
  currentMeta?: ServiceDefinition;
  locale?: SupportedLocale;
  quickModes?: ServiceDefinition[];
  activeService?: ServiceMode;
  sidebarOpen?: boolean;
  onServiceChange?: (service: ServiceMode) => void;
  onToggleSidebar?: () => void;
  sidebarToggleOpenLabel?: string;
  sidebarToggleCloseLabel?: string;
}

export function TopNavbar({
  eyebrow = 'One Window Dashboard',
  title = 'Dashboard',
  subtitle = '',
  openingLabel = 'Opening',
  currentMeta = FALLBACK_META,
  locale = 'en',
  quickModes = [],
  activeService,
  sidebarOpen = true,
  onServiceChange,
  onToggleSidebar,
  sidebarToggleOpenLabel = 'Open services',
  sidebarToggleCloseLabel = 'Hide services',
}: TopNavbarProps) {
  const CurrentIcon = currentMeta.icon;
  const safeActiveService = activeService ?? currentMeta.id;

  return (
    <div className="rounded-[32px] border border-white/10 bg-black/25 p-5 shadow-[0_24px_80px_rgba(2,12,27,0.4)] backdrop-blur-xl">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-200">
            <Sparkles className="h-3.5 w-3.5" />
            {eyebrow}
          </span>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-300/75 sm:text-base">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-[28px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200">
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', currentMeta.accent)}>
            <CurrentIcon className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{openingLabel}</p>
            <p className="font-semibold text-white">{currentMeta.label[locale]}</p>
            <p className="text-xs text-slate-400">{currentMeta.description[locale]}</p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {quickModes.map((service) => {
          const ServiceIcon = service.icon;
          const isActive = service.id === safeActiveService;
          return (
            <button
              key={service.id}
              type="button"
              onClick={() => onServiceChange?.(service.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'border-cyan-400/30 bg-cyan-400/12 text-white shadow-[0_0_24px_rgba(34,211,238,0.16)]'
                  : 'border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.08]'
              )}
            >
              <ServiceIcon className="h-4 w-4" />
              {service.label[locale]}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-2 xl:hidden">
        <button
          type="button"
          onClick={() => onToggleSidebar?.()}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:border-white/20 hover:bg-white/[0.08]"
        >
          {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          {sidebarOpen ? sidebarToggleCloseLabel : sidebarToggleOpenLabel}
        </button>
      </div>
    </div>
  );
}