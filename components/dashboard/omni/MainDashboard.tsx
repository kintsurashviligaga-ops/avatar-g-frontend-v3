'use client';

import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
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

        <div className="flex min-h-0 flex-1 gap-3 p-3 sm:p-4">
          <aside className="omni-pane omni-service-nav hidden w-[248px] flex-col rounded-2xl border p-2 lg:flex">
            <div className="mb-2 rounded-xl border border-white/10 bg-black/20 p-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Service Grid</p>
              <p className="mt-1 text-xs text-white/68">13 fixed modules in one viewport</p>
              <p className="mt-1 text-xs text-white/55">
                {countLabel(runningCount)} running · {enabledCount} enabled
              </p>
            </div>

            <div className="omni-service-list min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
              {OMNI_SERVICES.map((service) => {
                const active = activeServiceId === service.id;
                const state = services[service.id];
                const Icon = service.icon;
                return (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setActiveService(service.id as ServiceId)}
                    className={`omni-service-button ${active ? 'is-active' : ''}`}
                  >
                    <span className="omni-led" style={{ backgroundColor: state.status === 'running' ? '#fbbf24' : service.accent }} />
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 bg-white/[0.05]">
                      <Icon className="h-4 w-4" style={{ color: service.accent }} />
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="block truncate text-[12px] font-semibold text-white/90">{service.title}</span>
                      <span className="block truncate text-[10px] text-white/45">{service.subtitle}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(350px,1fr)]">
              <PrimaryAgentChat />
              <LivePreviewEngine />
            </div>
            <ServiceOrchestrator />
          </section>
        </div>

        <ActivityLogPanel />
      </div>

      <motion.div
        className="omni-mobile-service-strip lg:hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
      >
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-black/35 p-1.5">
          {OMNI_SERVICES.map((service) => {
            const active = activeServiceId === service.id;
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => setActiveService(service.id as ServiceId)}
                className={`shrink-0 rounded-lg border px-2.5 py-1 text-[11px] ${
                  active ? 'border-cyan-200/45 bg-cyan-200/18 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-white/70'
                }`}
              >
                {OMNI_SERVICE_MAP[service.id].short}
              </button>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
