'use client';

import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Play, SlidersHorizontal } from 'lucide-react';
import { OMNI_SERVICE_MAP } from './services';
import { useOmniDashboardStore } from './store';
import type { PreviewArtifact } from './types';
import { countLabel } from './utils';

interface KnobDialProps {
  label: string;
  value: number;
  accent: string;
  onChange: (value: number) => void;
}

function KnobDial({ label, value, accent, onChange }: KnobDialProps) {
  const angle = -130 + (value / 100) * 260;
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">{label}</p>
      <div className="flex items-center gap-3">
        <div className="omni-knob-shell">
          <div className="omni-knob-face">
            <span className="omni-knob-pointer" style={{ transform: `rotate(${angle}deg)`, backgroundColor: accent }} />
          </div>
        </div>
        <div className="flex-1">
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(event) => onChange(Number(event.target.value))}
            className="omni-range w-full"
            aria-label={label}
          />
          <p className="mt-1 font-mono text-[11px] text-white/55">{value}%</p>
        </div>
      </div>
    </div>
  );
}

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
      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2"
    >
      <span className="text-xs font-medium text-white/75">{label}</span>
      <span
        className="omni-toggle-track"
        style={{ borderColor: checked ? `${accent}80` : 'rgba(148, 163, 184, 0.5)', background: checked ? `${accent}26` : 'rgba(15,23,42,0.7)' }}
      >
        <span className="omni-toggle-thumb" style={{ transform: checked ? 'translateX(16px)' : 'translateX(0px)' }} />
      </span>
    </button>
  );
}

export function ServiceOrchestrator() {
  const activeServiceId = useOmniDashboardStore((state) => state.activeServiceId);
  const serviceState = useOmniDashboardStore((state) => state.services[state.activeServiceId]);
  const sharedAssets = useOmniDashboardStore((state) => state.sharedAssets);
  const setServiceDial = useOmniDashboardStore((state) => state.setServiceDial);
  const toggleServiceFlag = useOmniDashboardStore((state) => state.toggleServiceFlag);
  const runServiceNow = useOmniDashboardStore((state) => state.runServiceNow);
  const focusPreview = useOmniDashboardStore((state) => state.focusPreview);

  const descriptor = OMNI_SERVICE_MAP[activeServiceId];
  const [manualPrompt, setManualPrompt] = useState(descriptor.defaultPrompt);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    setManualPrompt(descriptor.defaultPrompt);
  }, [descriptor.defaultPrompt]);

  const linkedReferences = useMemo(() => {
    return serviceState.referenceIds
      .map((refId) => sharedAssets.find((asset) => asset.id === refId))
      .filter((asset): asset is PreviewArtifact => Boolean(asset));
  }, [serviceState.referenceIds, sharedAssets]);

  const runNow = async () => {
    if (running) return;
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
          <div className="mb-3 flex flex-wrap items-center gap-3 border-b border-white/10 pb-3">
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
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.9fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              <KnobDial
                label="Fidelity"
                value={serviceState.fidelity}
                accent={descriptor.accent}
                onChange={(value) => setServiceDial(activeServiceId, 'fidelity', value)}
              />
              <KnobDial
                label="Intensity"
                value={serviceState.intensity}
                accent={descriptor.accent}
                onChange={(value) => setServiceDial(activeServiceId, 'intensity', value)}
              />

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

            <div className="space-y-3">
              <div className="rounded-xl border border-white/10 bg-black/25 p-2.5">
                <label className="mb-1 block text-[11px] font-mono text-white/45">manual_run.cmd</label>
                <textarea
                  rows={3}
                  value={manualPrompt}
                  onChange={(event) => setManualPrompt(event.target.value)}
                  className="w-full resize-none bg-transparent text-sm text-white/85 outline-none"
                />
                <button
                  type="button"
                  onClick={() => void runNow()}
                  disabled={running || !manualPrompt.trim()}
                  className="omni-button mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  Run Worker
                </button>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Linked References</p>
                {linkedReferences.length === 0 ? (
                  <p className="text-xs text-white/45">No references bridged yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {linkedReferences.slice(0, 4).map((asset) => (
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
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </section>
  );
}
