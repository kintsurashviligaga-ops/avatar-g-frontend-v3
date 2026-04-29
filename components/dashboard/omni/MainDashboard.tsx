'use client';

import { useEffect, useMemo } from 'react';
import { CircleDollarSign, Gauge, ShieldCheck } from 'lucide-react';
import { OMNI_SERVICE_MAP, OMNI_SERVICES } from './services';
import { useOmniDashboardStore } from './store';
import type { ServiceId } from './types';
import { ActivityLogPanel } from './ActivityLogPanel';
import { LivePreviewEngine } from './LivePreviewEngine';
import { PrimaryAgentChat } from './PrimaryAgentChat';
import { ServiceOrchestrator } from './ServiceOrchestrator';
import { countLabel } from './utils';

interface MainDashboardProps {
  locale: string;
  userName: string;
  isAuthenticated: boolean;
}

export default function MainDashboard({ locale, userName, isAuthenticated }: MainDashboardProps) {
  const activeServiceId = useOmniDashboardStore((state) => state.activeServiceId);
  const services = useOmniDashboardStore((state) => state.services);
  const baselineGel = useOmniDashboardStore((state) => state.baselineGel);
  const credits = useOmniDashboardStore((state) => state.credits);
  const auth = useOmniDashboardStore((state) => state.auth);
  const setLocale = useOmniDashboardStore((state) => state.setLocale);
  const setAuthSnapshot = useOmniDashboardStore((state) => state.setAuthSnapshot);
  const setActiveService = useOmniDashboardStore((state) => state.setActiveService);

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

  const runningCount = useMemo(
    () => OMNI_SERVICES.filter((service) => services[service.id].status === 'running').length,
    [services],
  );
  const enabledCount = useMemo(
    () => OMNI_SERVICES.filter((service) => services[service.id].enabled).length,
    [services],
  );

  return (
    <div className="omni-root h-full w-full overflow-hidden p-2 sm:p-3 lg:p-4">
      <div className="omni-frame flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border">
        <header className="omni-topbar flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-2">
            <span className="omni-led is-online" />
            <p className="omni-title text-sm font-semibold text-white">Omni-Dashboard Command Center</p>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-white/85">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              {auth.status === 'authenticated' ? `Signed in as ${auth.displayName}` : 'Guest Mode'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-white/85">
              <CircleDollarSign className="h-3.5 w-3.5 text-cyan-200" />
              Baseline Budget: {baselineGel.toLocaleString()} GEL
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-white/85">
              <Gauge className="h-3.5 w-3.5 text-amber-300" />
              Credits: {credits.toLocaleString()}
            </span>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 p-3 sm:p-4">
          <section className="omni-pane flex min-h-0 flex-1 flex-col rounded-2xl border border-white/12 bg-black/20 p-3 sm:p-4">
            <header className="mb-3 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="omni-led is-online" />
                <p className="text-sm font-semibold text-white">Unified Operations Window</p>
              </div>
              <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
                Active: {OMNI_SERVICE_MAP[activeServiceId].title}
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
                {countLabel(runningCount)} running · {enabledCount} enabled
              </span>
            </header>

            <div className="mb-3 flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/30 p-1.5">
              {OMNI_SERVICES.map((service) => {
                const active = activeServiceId === service.id;
                const state = services[service.id];
                const Icon = service.icon;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setActiveService(service.id as ServiceId)}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                      active
                        ? 'border-cyan-200/45 bg-cyan-200/18 text-cyan-50'
                        : 'border-white/10 bg-white/[0.03] text-white/72 hover:bg-white/[0.08]'
                    }`}
                  >
                    <span className="omni-led" style={{ backgroundColor: state.status === 'running' ? '#fbbf24' : service.accent }} />
                    <Icon className="h-3.5 w-3.5" />
                    {OMNI_SERVICE_MAP[service.id].short}
                  </button>
                );
              })}
            </div>

            <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,1fr)]">
              <PrimaryAgentChat />
              <LivePreviewEngine />
            </div>

            <div className="mt-3">
              <ServiceOrchestrator />
            </div>

            <div className="mt-3 min-h-[170px]">
              <ActivityLogPanel embedded />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
