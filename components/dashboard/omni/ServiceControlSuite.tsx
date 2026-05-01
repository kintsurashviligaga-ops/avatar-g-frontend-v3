'use client';

import type { ServiceId } from './types';

interface ServiceControlSuiteProps {
  serviceId: ServiceId;
  accent: string;
  settings: Record<string, string | number | boolean>;
  setSetting: (key: string, value: string | number | boolean) => void;
}

function RangeField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.13em] text-white/52">{label}</p>
        <span className="font-mono text-[11px] text-white/68">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="omni-range w-full"
      />
    </div>
  );
}

function ToggleCell({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs text-white/75 transition-colors hover:bg-white/[0.08]"
    >
      {label} · {checked ? 'on' : 'off'}
    </button>
  );
}

export function ServiceControlSuite({ serviceId, accent, settings, setSetting }: ServiceControlSuiteProps) {
  const readNumber = (key: string, fallback: number) => {
    const value = settings[key];
    return typeof value === 'number' ? value : fallback;
  };

  const readBool = (key: string, fallback: boolean) => {
    const value = settings[key];
    return typeof value === 'boolean' ? value : fallback;
  };

  const readText = (key: string, fallback: string) => {
    const value = settings[key];
    return typeof value === 'string' ? value : fallback;
  };

  const surface = (
    title: string,
    subtitle: string,
    content: React.ReactNode,
  ) => (
    <section className="rounded-xl border border-white/10 bg-black/25 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-white/92">{title}</p>
          <p className="text-xs text-white/46">{subtitle}</p>
        </div>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: accent, boxShadow: `0 0 12px ${accent}` }} />
      </div>
      {content}
    </section>
  );

  if (serviceId === 'avatar') {
    return surface(
      'Avatar Canvas Lab',
      'Pose, expression, and identity blend controls',
      <div className="space-y-2">
        <div className="rounded border border-white/10 bg-slate-950/60 p-2 text-xs text-white/65">Canvas Toolset: Crop · Relight · Mesh Blend</div>
        <RangeField
          label="Persona Blend"
          value={readNumber('personaBlend', 62)}
          min={0}
          max={100}
          onChange={(value) => setSetting('personaBlend', value)}
        />
        <RangeField
          label="Expression Control"
          value={readNumber('expression', 55)}
          min={0}
          max={100}
          onChange={(value) => setSetting('expression', value)}
        />
      </div>,
    );
  }

  if (serviceId === 'image') {
    return surface(
      'Image Canvas Tools',
      'Brush, aspect, and composition controls',
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {['1:1', '16:9', '9:16'].map((ratio) => (
            <button
              key={ratio}
              type="button"
              className={`rounded border px-2 py-1.5 text-xs ${
                readText('aspect', '16:9') === ratio ? 'border-cyan-200/45 bg-cyan-200/16 text-cyan-50' : 'border-white/10 bg-white/[0.03] text-white/70'
              }`}
              onClick={() => setSetting('aspect', ratio)}
            >
              {ratio}
            </button>
          ))}
        </div>
        <RangeField
          label="Brush Hardness"
          value={readNumber('brush', 34)}
          min={0}
          max={100}
          onChange={(value) => setSetting('brush', value)}
        />
        <RangeField
          label="Texture Weight"
          value={readNumber('texture', 72)}
          min={0}
          max={100}
          onChange={(value) => setSetting('texture', value)}
        />
      </div>,
    );
  }

  if (serviceId === 'video') {
    return surface(
      'Video Timeline Deck',
      'Scene sequencing and pacing controls',
      <div className="space-y-2">
        <div className="rounded border border-white/10 bg-white/[0.03] p-2 text-xs text-white/75">
          Storyboard lanes: Intro · Hook · Product · CTA
        </div>
        <RangeField
          label="Frame Rate"
          value={readNumber('fps', 30)}
          min={12}
          max={60}
          onChange={(value) => setSetting('fps', value)}
        />
        <RangeField
          label="Cut Frequency"
          value={readNumber('cutFrequency', 43)}
          min={0}
          max={100}
          onChange={(value) => setSetting('cutFrequency', value)}
        />
      </div>,
    );
  }

  if (serviceId === 'game-creation') {
    return surface(
      'Game Systems Board',
      'Loop design, progression pacing, and balance confidence',
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          {['Core Loop', 'Progression', 'Rewards'].map((cell) => (
            <div key={cell} className="rounded border border-white/10 bg-white/[0.04] p-2 text-white/72">
              {cell}
            </div>
          ))}
        </div>
        <RangeField
          label="Gameplay Loops"
          value={readNumber('gameplayLoops', 3)}
          min={1}
          max={8}
          onChange={(value) => setSetting('gameplayLoops', value)}
        />
        <RangeField
          label="Balance Focus"
          value={readNumber('balanceFocus', 74)}
          min={0}
          max={100}
          onChange={(value) => setSetting('balanceFocus', value)}
        />
        <ToggleCell label="Progression Map" checked={readBool('progressionMap', true)} onChange={(value) => setSetting('progressionMap', value)} />
      </div>,
    );
  }

  if (serviceId === 'music') {
    return surface(
      'Music Sequencer Grid',
      'Pattern lanes, tempo, and mastering emphasis',
      <div className="space-y-2">
        <div className="grid grid-cols-8 gap-1.5">
          {Array.from({ length: 8 }).map((_, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setSetting(`step-${idx}`, !readBool(`step-${idx}`, idx % 2 === 0))}
              className={`h-7 rounded border text-[11px] ${
                readBool(`step-${idx}`, idx % 2 === 0)
                  ? 'border-emerald-300/40 bg-emerald-300/16 text-emerald-50'
                  : 'border-white/10 bg-white/[0.03] text-white/65'
              }`}
            >
              {idx + 1}
            </button>
          ))}
        </div>
        <RangeField
          label="Tempo"
          value={readNumber('tempo', 112)}
          min={60}
          max={180}
          onChange={(value) => setSetting('tempo', value)}
        />
      </div>,
    );
  }

  if (serviceId === 'prompt-builder') {
    return surface(
      'Prompt Script Builder',
      'Template sections, structure, and output pressure',
      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-1.5">
          <ToggleCell label="Hook" checked={readBool('section-hook', true)} onChange={(value) => setSetting('section-hook', value)} />
          <ToggleCell label="Body" checked={readBool('section-body', true)} onChange={(value) => setSetting('section-body', value)} />
          <ToggleCell label="Proof" checked={readBool('section-proof', true)} onChange={(value) => setSetting('section-proof', value)} />
          <ToggleCell label="CTA" checked={readBool('section-cta', true)} onChange={(value) => setSetting('section-cta', value)} />
        </div>
        <RangeField
          label="Persuasion Weight"
          value={readNumber('persuasion', 71)}
          min={0}
          max={100}
          onChange={(value) => setSetting('persuasion', value)}
        />
      </div>,
    );
  }

  if (serviceId === 'terminal-coding') {
    return surface(
      'Terminal Runbook Matrix',
      'Command routing, safety constraints, and retry policies',
      <div className="space-y-2">
        <label className="text-xs text-white/68">
          Router mode
          <select
            className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900/80 px-2 py-1.5 text-sm text-white"
            value={readText('routerMode', 'balanced')}
            onChange={(event) => setSetting('routerMode', event.target.value)}
          >
            <option value="balanced">Balanced</option>
            <option value="aggressive">Aggressive</option>
            <option value="safety-first">Safety First</option>
          </select>
        </label>
        <RangeField
          label="Chain Depth"
          value={readNumber('chainDepth', 4)}
          min={1}
          max={10}
          onChange={(value) => setSetting('chainDepth', value)}
        />
        <RangeField
          label="Parallel Lanes"
          value={readNumber('lanes', 4)}
          min={1}
          max={8}
          onChange={(value) => setSetting('lanes', value)}
        />
        <RangeField
          label="Retries"
          value={readNumber('retries', 2)}
          min={0}
          max={8}
          onChange={(value) => setSetting('retries', value)}
        />
        <ToggleCell label="Failover" checked={readBool('failover', true)} onChange={(value) => setSetting('failover', value)} />
        <ToggleCell label="Shell Safety" checked={readBool('shellSafety', true)} onChange={(value) => setSetting('shellSafety', value)} />
      </div>,
    );
  }

  if (serviceId === 'interior-design') {
    return surface(
      'Interior Layout Studio',
      'Space proportions, material mood, and furniture balance',
      <div className="space-y-2">
        <div className="grid grid-cols-3 gap-1.5 text-[11px]">
          {['Flow', 'Light', 'Texture'].map((item) => (
            <div key={item} className="rounded border border-white/10 bg-white/[0.04] p-1.5 text-center text-white/72">
              {item}
            </div>
          ))}
        </div>
        <RangeField
          label="Layout Precision"
          value={readNumber('layoutPrecision', 72)}
          min={0}
          max={100}
          onChange={(value) => setSetting('layoutPrecision', value)}
        />
        <RangeField
          label="Style Range"
          value={readNumber('styleRange', 4)}
          min={1}
          max={8}
          onChange={(value) => setSetting('styleRange', value)}
        />
        <ToggleCell label="Material Mode" checked={readBool('materialMode', true)} onChange={(value) => setSetting('materialMode', value)} />
      </div>,
    );
  }

  return surface(
    'Service Control Panel',
    'Generic controls for this service',
    <div className="space-y-2">
      <RangeField
        label="Precision"
        value={readNumber('precision', 61)}
        min={0}
        max={100}
        onChange={(value) => setSetting('precision', value)}
      />
      <RangeField
        label="Throughput"
        value={readNumber('throughput', 55)}
        min={0}
        max={100}
        onChange={(value) => setSetting('throughput', value)}
      />
      <ToggleCell label="Safety Lock" checked={readBool('safetyLock', true)} onChange={(value) => setSetting('safetyLock', value)} />
    </div>,
  );
}
