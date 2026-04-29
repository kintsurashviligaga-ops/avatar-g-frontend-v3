'use client';

import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Gauge, ShieldCheck } from 'lucide-react';
import { OMNI_SERVICE_MAP, OMNI_SERVICES } from './services';
import { useOmniDashboardStore } from './store';
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
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<'preview' | 'orchestrator' | 'activity'>('preview');

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
                <div>
                  <p className="text-sm font-semibold text-white">One AI Chat Window</p>
                  <p className="text-[11px] text-white/50">Type once. Agent G routes work to the right services and returns the best answer in this chat.</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                Auto Router Active
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
                Active: {OMNI_SERVICE_MAP[activeServiceId].title}
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
                {countLabel(runningCount)} running · {enabledCount} enabled
              </span>
            </header>

            <div className="min-h-0 flex-1">
              <PrimaryAgentChat />
            </div>

            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Workspace Tools</p>
                <button
                  type="button"
                  onClick={() => setToolsOpen((value) => !value)}
                  className="rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs font-semibold text-white/80 hover:bg-white/[0.1]"
                >
                  {toolsOpen ? 'Hide Tools' : 'Open Tools'}
                </button>
              </div>

              {toolsOpen && (
                <div className="mt-2">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setToolsTab('preview')}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        toolsTab === 'preview'
                          ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
                          : 'border-white/10 bg-white/[0.03] text-white/75'
                      }`}
                    >
                      Preview
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolsTab('orchestrator')}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        toolsTab === 'orchestrator'
                          ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
                          : 'border-white/10 bg-white/[0.03] text-white/75'
                      }`}
                    >
                      Orchestrator
                    </button>
                    <button
                      type="button"
                      onClick={() => setToolsTab('activity')}
                      className={`rounded-lg border px-2.5 py-1 text-xs ${
                        toolsTab === 'activity'
                          ? 'border-cyan-300/45 bg-cyan-400/15 text-cyan-100'
                          : 'border-white/10 bg-white/[0.03] text-white/75'
                      }`}
                    >
                      Activity
                    </button>
                  </div>

                  <div className="max-h-[42vh] overflow-auto">
                    {toolsTab === 'preview' && <LivePreviewEngine />}
                    {toolsTab === 'orchestrator' && <ServiceOrchestrator />}
                    {toolsTab === 'activity' && <ActivityLogPanel embedded />}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
