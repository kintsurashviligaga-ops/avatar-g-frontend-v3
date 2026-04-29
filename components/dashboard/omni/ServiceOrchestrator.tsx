'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronUp, Loader2, Play, SlidersHorizontal } from 'lucide-react';

import { ServiceControlSuite } from './ServiceControlSuite';
import { OMNI_SERVICE_MAP, OMNI_SERVICES } from './services';
import { useOmniDashboardStore } from './store';
import type { PreviewArtifact, ServiceId } from './types';
import { countLabel } from './utils';

interface ToggleSwitchProps {
  checked: boolean;
  label: string;
  accent: string;
  onToggle: () => void;
}

function ToggleSwitch({ checked, label, accent, onToggle }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left"
    >
      <span className="text-xs font-semibold uppercase tracking-[0.12em] text-white/60">{label}</span>
      <span
        className="relative inline-flex h-5 w-10 items-center rounded-full border border-white/15 bg-black/35 transition-colors"
        style={{ backgroundColor: checked ? `${accent}55` : undefined }}
      >
        <span
          className={`absolute h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

interface RangeFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function RangeField({ label, value, onChange }: RangeFieldProps) {
  return (
    <label className="block rounded-xl border border-white/10 bg-black/20 p-2.5">
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/55">
        <span className="uppercase tracking-[0.12em]">{label}</span>
        <span className="tabular-nums text-white/75">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-white"
      />
    </label>
  );
}

interface ExpertFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

function ExpertField({ label, value, onChange }: ExpertFieldProps) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-[11px] text-white/55">
        <span className="uppercase tracking-[0.12em]">{label}</span>
        <span className="tabular-nums text-white/75">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-white"
      />
    </label>
  );
}

export function ServiceOrchestrator() {
  const activeServiceId = useOmniDashboardStore((state) => state.activeServiceId);
  const services = useOmniDashboardStore((state) => state.services);
  const sharedAssets = useOmniDashboardStore((state) => state.sharedAssets);

  const setServiceDial = useOmniDashboardStore((state) => state.setServiceDial);
  const toggleServiceFlag = useOmniDashboardStore((state) => state.toggleServiceFlag);
  const setExpertSetting = useOmniDashboardStore((state) => state.setExpertSetting);
  const setModuleSetting = useOmniDashboardStore((state) => state.setModuleSetting);
  const runServiceNow = useOmniDashboardStore((state) => state.runServiceNow);
  const focusPreview = useOmniDashboardStore((state) => state.focusPreview);
  const bridgeAssetToService = useOmniDashboardStore((state) => state.bridgeAssetToService);

  const descriptor = OMNI_SERVICE_MAP[activeServiceId];
  const serviceState = services[activeServiceId];

  const [manualPrompt, setManualPrompt] = useState(serviceState.lastPrompt);
  const [running, setRunning] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [targetServiceId, setTargetServiceId] = useState<ServiceId>(activeServiceId);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setManualPrompt(serviceState.lastPrompt);
  }, [activeServiceId, serviceState.lastPrompt]);

  const linkedReferences = useMemo(
    () =>
      serviceState.referenceIds
        .map((id) => sharedAssets.find((asset) => asset.id === id))
        .filter((asset): asset is PreviewArtifact => Boolean(asset)),
    [serviceState.referenceIds, sharedAssets],
  );

  const bridgeCandidates = useMemo(() => {
    const seen = new Set<string>();
    return sharedAssets.filter((asset) => {
      if (seen.has(asset.id)) {
        return false;
      }
      seen.add(asset.id);
      return true;
    });
  }, [sharedAssets]);

  useEffect(() => {
    if (!targetServiceId || !OMNI_SERVICE_MAP[targetServiceId]) {
      setTargetServiceId(activeServiceId);
    }
  }, [activeServiceId, targetServiceId]);

  useEffect(() => {
    if (bridgeCandidates.length === 0) {
      setSelectedAssetId('');
      return;
    }

    const exists = bridgeCandidates.some((asset) => asset.id === selectedAssetId);
    if (!exists) {
      const firstCandidate = bridgeCandidates[0];
      if (firstCandidate) {
        setSelectedAssetId(firstCandidate.id);
      }
    }
  }, [bridgeCandidates, selectedAssetId]);

  const runNow = async () => {
    if (running || !manualPrompt.trim()) {
      return;
    }

    setRunning(true);
    try {
      await runServiceNow(activeServiceId, manualPrompt);
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="omni-pane omni-control-panel rounded-2xl border p-3 sm:p-4">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeServiceId}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" style={{ color: descriptor.accent }} />
              <p className="omni-title text-sm font-semibold text-white">Service Orchestrator</p>
            </div>
            <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
              {descriptor.title} · status {serviceState.status}
            </span>
            <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[11px] text-white/70">
              queue {countLabel(serviceState.queueDepth)}
            </span>
            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="ml-auto inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80 hover:bg-white/[0.08]"
            >
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
            </button>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="mb-1 text-sm font-semibold text-white/90">Quick Controls</p>
              <p className="mb-2 text-xs text-white/45">Everyday controls for fast operation.</p>

              <div className="grid gap-2 sm:grid-cols-3">
                <ToggleSwitch
                  checked={serviceState.enabled}
                  label="Service Power"
                  accent={descriptor.accent}
                  onToggle={() => toggleServiceFlag(activeServiceId, 'enabled')}
                />
                <ToggleSwitch
                  checked={serviceState.autopilot}
                  label="Autopilot"
                  accent={descriptor.accent}
                  onToggle={() => toggleServiceFlag(activeServiceId, 'autopilot')}
                />
                <ToggleSwitch
                  checked={serviceState.syncPreview}
                  label="Sync To Preview"
                  accent={descriptor.accent}
                  onToggle={() => toggleServiceFlag(activeServiceId, 'syncPreview')}
                />
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <RangeField
                  label="Fidelity"
                  value={serviceState.fidelity}
                  onChange={(value) => setServiceDial(activeServiceId, 'fidelity', value)}
                />
                <RangeField
                  label="Intensity"
                  value={serviceState.intensity}
                  onChange={(value) => setServiceDial(activeServiceId, 'intensity', value)}
                />
              </div>
            </section>

            <section className="rounded-xl border border-white/10 bg-black/25 p-3">
              <p className="mb-1 text-sm font-semibold text-white/90">Manual Run</p>
              <p className="mb-2 text-xs text-white/45">Quickly execute the active service with a custom prompt.</p>

              <textarea
                rows={4}
                value={manualPrompt}
                onChange={(event) => setManualPrompt(event.target.value)}
                className="w-full resize-none rounded-lg border border-white/10 bg-black/35 p-2 text-sm text-white/85 outline-none"
              />

              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setManualPrompt(descriptor.defaultPrompt)}
                  className="rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-white/75 hover:bg-white/[0.08]"
                >
                  Use Default
                </button>
                <button
                  type="button"
                  onClick={() => void runNow()}
                  disabled={running || !manualPrompt.trim()}
                  className="omni-button inline-flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run Worker
                </button>
              </div>
            </section>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
            <section className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="mb-2 text-sm font-semibold text-white/90">Linked References</p>
              {linkedReferences.length === 0 ? (
                <p className="text-xs text-white/45">No references bridged yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {linkedReferences.slice(0, 5).map((asset) => (
                    <button
                      type="button"
                      key={asset.id}
                      onClick={() => focusPreview(asset.id)}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-xs text-white/78 transition-colors hover:bg-white/[0.08]"
                    >
                      {asset.title}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-sm font-semibold text-white/90">Universal State Bridge</p>
              <p className="mb-2 text-xs text-white/45">Push any output as immediate input to another service.</p>
              <div className="grid gap-2 md:grid-cols-[1.6fr_1.2fr_auto]">
                <select
                  className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-2 text-xs text-white"
                  value={selectedAssetId}
                  onChange={(event) => setSelectedAssetId(event.target.value)}
                >
                  {bridgeCandidates.length === 0 && <option value="">No outputs available</option>}
                  {bridgeCandidates.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.title}
                    </option>
                  ))}
                </select>

                <select
                  className="rounded-lg border border-white/10 bg-slate-950/80 px-2 py-2 text-xs text-white"
                  value={targetServiceId}
                  onChange={(event) => setTargetServiceId(event.target.value as ServiceId)}
                >
                  {OMNI_SERVICES.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.title}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  className="omni-button rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                  disabled={!selectedAssetId}
                  onClick={() => bridgeAssetToService(selectedAssetId, targetServiceId)}
                >
                  Push Input
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {OMNI_SERVICES.filter((service) => service.id !== activeServiceId)
                  .slice(0, 6)
                  .map((service) => (
                    <button
                      key={service.id}
                      type="button"
                      onClick={() => setTargetServiceId(service.id)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] text-white/72 transition-colors hover:bg-white/[0.09]"
                    >
                      {service.short}
                    </button>
                  ))}
              </div>
            </section>
          </div>

          <AnimatePresence>
            {showAdvanced && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]"
              >
                <ServiceControlSuite
                  serviceId={activeServiceId}
                  accent={descriptor.accent}
                  settings={serviceState.moduleSettings}
                  setSetting={(key, value) => setModuleSetting(activeServiceId, key, value)}
                />

                <section className="rounded-xl border border-white/10 bg-black/25 p-3">
                  <p className="mb-1 text-sm font-semibold text-white/90">Expert Panel</p>
                  <p className="mb-3 text-xs text-white/45">Seed, Sampling, Weights, and Temperature controls.</p>
                  <div className="space-y-2.5">
                    <ExpertField
                      label="Seed"
                      value={serviceState.expert.seed}
                      onChange={(value) => setExpertSetting(activeServiceId, 'seed', value)}
                    />
                    <ExpertField
                      label="Sampling"
                      value={serviceState.expert.sampling}
                      onChange={(value) => setExpertSetting(activeServiceId, 'sampling', value)}
                    />
                    <ExpertField
                      label="Weights"
                      value={serviceState.expert.weights}
                      onChange={(value) => setExpertSetting(activeServiceId, 'weights', value)}
                    />
                    <ExpertField
                      label="Temperature"
                      value={serviceState.expert.temperature}
                      onChange={(value) => setExpertSetting(activeServiceId, 'temperature', value)}
                    />
                  </div>
                </section>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

export default ServiceOrchestrator;
