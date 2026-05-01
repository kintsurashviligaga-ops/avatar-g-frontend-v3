'use client';

import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { useMemo } from 'react';

import { OMNI_SERVICES } from './services';
import { useOmniDashboardStore } from './store';
import { countLabel } from './utils';

export function ServiceSelectionGrid() {
  const activeServiceId = useOmniDashboardStore((state) => state.activeServiceId);
  const services = useOmniDashboardStore((state) => state.services);
  const setActiveService = useOmniDashboardStore((state) => state.setActiveService);

  const runningCount = useMemo(
    () => OMNI_SERVICES.filter((service) => services[service.id].status === 'running').length,
    [services],
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="mb-3 border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-cyan-200" />
          <p className="text-sm font-semibold text-white">Service Selection</p>
        </div>
        <p className="mt-1 text-xs text-white/55">Tap any service to route Agent G instantly across all modules.</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-white/80">
            {countLabel(OMNI_SERVICES.length)} services
          </span>
          <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-emerald-100">
            {countLabel(runningCount)} running
          </span>
        </div>
      </header>

      <div className="omni-service-list min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-2">
          {OMNI_SERVICES.map((service) => {
            const runtime = services[service.id];
            const Icon = service.icon;
            const isActive = activeServiceId === service.id;

            return (
              <button
                key={service.id}
                type="button"
                onClick={() => setActiveService(service.id)}
                className={`omni-service-button min-h-[44px] rounded-xl px-3 py-2.5 text-left ${isActive ? 'is-active' : ''}`}
              >
                <div className="flex w-full items-start gap-2.5">
                  <span
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: `${service.accent}55`,
                      backgroundColor: `${service.accent}1A`,
                    }}
                  >
                    <Icon className="h-4 w-4" style={{ color: service.accent }} />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-semibold text-white/90">{service.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-white/55">{service.short}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.11em] text-white/45">
                      {runtime.enabled ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 text-white/35" />
                      )}
                      {runtime.status}
                    </span>
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ServiceSelectionGrid;
