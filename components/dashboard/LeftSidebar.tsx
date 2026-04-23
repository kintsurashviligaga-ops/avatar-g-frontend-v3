'use client';

import { LayoutDashboard, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardServiceGroup, ServiceGroup, ServiceMode, SupportedLocale } from '@/types/dashboard';

const DEFAULT_GROUP_LABELS: Record<ServiceGroup, string> = {
  featured: 'Featured',
  create: 'Create',
  intelligence: 'Intelligence',
  automation: 'Automation',
  business: 'Business',
};

interface LeftSidebarProps {
  isOpen?: boolean;
  locale?: SupportedLocale;
  serviceCount?: number;
  serviceBrowserLabel?: string;
  serviceCountLabel?: string;
  searchPlaceholder?: string;
  emptySearchLabel?: string;
  groupLabels?: Record<ServiceGroup, string>;
  filteredGroups?: DashboardServiceGroup[];
  activeService?: ServiceMode;
  searchTerm?: string;
  onSearchTermChange?: (value: string) => void;
  onServiceChange?: (service: ServiceMode) => void;
  formatCost?: (cost: number) => string;
}

export function LeftSidebar({
  isOpen = true,
  locale = 'en',
  serviceCount = 0,
  serviceBrowserLabel = 'Service Browser',
  serviceCountLabel = 'connected tools',
  searchPlaceholder = 'Search services...',
  emptySearchLabel = 'No services found.',
  groupLabels = DEFAULT_GROUP_LABELS,
  filteredGroups = [],
  activeService = 'agent-g',
  searchTerm = '',
  onSearchTermChange,
  onServiceChange,
  formatCost = (cost) => (cost > 0 ? `${cost} cr` : 'Included'),
}: LeftSidebarProps) {
  return (
    <aside className={cn('space-y-4 xl:sticky xl:top-5 xl:self-start', isOpen ? 'block' : 'hidden xl:block')}>
      <section className="rounded-[28px] border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05] text-slate-200">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{serviceBrowserLabel}</p>
            <p className="text-sm text-slate-400">{serviceCount} {serviceCountLabel}</p>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-slate-300">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            value={searchTerm}
            onChange={(event) => onSearchTermChange?.(event.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
          />
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-black/25 p-3 backdrop-blur-xl">
        <div className="space-y-4">
          {filteredGroups.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-500">
              {emptySearchLabel}
            </div>
          ) : (
            filteredGroups.map(({ group, services }) => (
              <div key={group} className="space-y-2">
                <p className="px-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                  {groupLabels[group]}
                </p>
                {services.map((service) => {
                  const ServiceIcon = service.icon;
                  const isActive = service.id === activeService;

                  return (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => onServiceChange?.(service.id)}
                      className={cn(
                        'group flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition-all',
                        isActive
                          ? 'border-cyan-400/25 bg-cyan-400/10'
                          : 'border-transparent bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.05]'
                      )}
                    >
                      <div className={cn('mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg', service.accent)}>
                        <ServiceIcon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-white">{service.label[locale]}</p>
                          <span className="text-xs text-slate-400">{formatCost(service.cost)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-400">{service.description[locale]}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  );
}