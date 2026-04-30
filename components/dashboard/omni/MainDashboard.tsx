'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDollarSign,
  Command,
  Gauge,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { OMNI_SERVICE_MAP, OMNI_SERVICES } from './services';
import { useOmniDashboardStore } from './store';
import { ActivityLogPanel } from './ActivityLogPanel';
import { LivePreviewEngine } from './LivePreviewEngine';
import { PrimaryAgentChat } from './PrimaryAgentChat';
import { ServiceOrchestrator } from './ServiceOrchestrator';
import { countLabel } from './utils';
import type { ServiceId } from './types';
import VoicePanel from '@/components/voice/VoicePanel';

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
  const setActiveService = useOmniDashboardStore((state) => state.setActiveService);
  const setLocale = useOmniDashboardStore((state) => state.setLocale);
  const setAuthSnapshot = useOmniDashboardStore((state) => state.setAuthSnapshot);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsTab, setToolsTab] = useState<'preview' | 'orchestrator' | 'activity'>('preview');
  const [serviceMenuOpen, setServiceMenuOpen] = useState(false);
  const [serviceFilter, setServiceFilter] = useState('');
  const serviceMenuRef = useRef<HTMLDivElement | null>(null);
  const serviceTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  const filteredServices = useMemo(() => {
    const query = serviceFilter.trim().toLowerCase();
    if (!query) {
      return OMNI_SERVICES;
    }

    return OMNI_SERVICES.filter((service) =>
      [service.title, service.subtitle, service.worker, service.short].join(' ').toLowerCase().includes(query),
    );
  }, [serviceFilter]);

  const handleServiceSelect = (serviceId: ServiceId) => {
    setActiveService(serviceId);
    setServiceMenuOpen(false);
    setServiceFilter('');
  };

  useEffect(() => {
    const onKeyboardShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') {
        return;
      }

      event.preventDefault();
      setServiceMenuOpen((open) => !open);
    };

    window.addEventListener('keydown', onKeyboardShortcut);
    return () => {
      window.removeEventListener('keydown', onKeyboardShortcut);
    };
  }, []);

  useEffect(() => {
    if (!serviceMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const targetNode = event.target as Node;
      if (serviceMenuRef.current?.contains(targetNode) || serviceTriggerRef.current?.contains(targetNode)) {
        return;
      }
      setServiceMenuOpen(false);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setServiceMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onEscape);

    return () => {
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onEscape);
    };
  }, [serviceMenuOpen]);

  return (
    <div className="omni-root h-full w-full overflow-hidden p-2 pb-safe sm:p-3 lg:p-4">
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

        <div className="flex min-h-0 flex-1 p-2.5 sm:p-3 md:p-4">
          <section className="omni-pane relative flex min-h-0 w-full flex-1 flex-col rounded-2xl border border-white/12 bg-black/20 p-3 sm:p-4">
            <header className="relative mb-3 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="omni-led is-online" />
                <div>
                  <p className="text-sm font-semibold text-white">One AI Chat Window</p>
                  <p className="text-[11px] text-white/50">Select a service, type once, and Agent G returns the best result in this single workspace.</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] text-emerald-100">
                Auto Router Active
              </span>
              <span className="rounded-full border border-cyan-300/35 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100">
                Step 1: Pick service · Step 2: Dispatch prompt
              </span>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  ref={serviceTriggerRef}
                  type="button"
                  aria-expanded={serviceMenuOpen}
                  aria-haspopup="listbox"
                  aria-controls="omni-service-selector"
                  onClick={() => setServiceMenuOpen((open) => !open)}
                  className="omni-service-trigger inline-flex min-h-[44px] items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold text-white"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className="omni-led is-online" />
                    Service Selector
                  </span>
                  <span className="truncate text-cyan-100/90">{OMNI_SERVICE_MAP[activeServiceId].title}</span>
                  <span className="hidden items-center gap-1 rounded-md border border-white/20 bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/75 md:inline-flex">
                    <Command className="h-3 w-3" />K
                  </span>
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${serviceMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
                  Active: {OMNI_SERVICE_MAP[activeServiceId].title}
                </span>
                <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
                  {countLabel(runningCount)} running · {enabledCount} enabled
                </span>
              </div>

              {serviceMenuOpen && (
                <div
                  ref={serviceMenuRef}
                  id="omni-service-selector"
                  role="listbox"
                  aria-label="Service selector"
                  className="omni-service-menu absolute left-0 right-0 top-full z-40 mt-2 max-h-[72vh] overflow-hidden rounded-2xl p-3 md:left-auto md:w-[430px]"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/85">Service Matrix</p>
                      <p className="text-[11px] text-white/55">Skeuomorphic command switcher for all 13 modules.</p>
                    </div>
                    <span className="rounded-lg border border-white/20 bg-white/[0.05] px-2 py-1 text-[10px] text-white/70">
                      {countLabel(filteredServices.length)} visible
                    </span>
                  </div>

                  <div className="omni-service-menu-search mb-2 flex items-center gap-2 rounded-xl px-2.5 py-2">
                    <Search className="h-3.5 w-3.5 text-white/50" />
                    <input
                      type="text"
                      value={serviceFilter}
                      onChange={(event) => setServiceFilter(event.target.value)}
                      placeholder="Filter services"
                      className="w-full bg-transparent text-xs text-white outline-none placeholder:text-white/40"
                    />
                  </div>

                  <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
                    {filteredServices.map((service) => {
                      const runtime = services[service.id];
                      const Icon = service.icon;
                      const isActive = activeServiceId === service.id;

                      return (
                        <button
                          key={service.id}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => handleServiceSelect(service.id)}
                          className={`omni-service-menu-item flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left ${
                            isActive ? 'is-active' : ''
                          }`}
                        >
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
                            <span className="block truncate text-xs font-semibold text-white/92">{service.title}</span>
                            <span className="block truncate text-[11px] text-white/55">{service.subtitle}</span>
                            <span className="mt-1 block text-[10px] uppercase tracking-[0.11em] text-white/45">
                              {runtime.status}
                              {runtime.queueDepth > 0 ? ` · queue ${runtime.queueDepth}` : ''}
                            </span>
                          </span>

                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.09em] text-white/55">
                            {runtime.enabled ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 text-white/35" />
                            )}
                            {runtime.enabled ? 'On' : 'Off'}
                          </span>
                        </button>
                      );
                    })}

                    {filteredServices.length === 0 && (
                      <div className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-5 text-center text-xs text-white/65">
                        No services match this filter.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </header>

            <div className="mb-3">
              <VoicePanel compact />
            </div>

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
