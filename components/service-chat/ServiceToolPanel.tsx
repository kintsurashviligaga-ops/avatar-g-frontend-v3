'use client';

/**
 * components/service-chat/ServiceToolPanel.tsx
 * ===============================================
 * Slide-down tool options panel for service-specific settings.
 * Supports chips, toggles, sliders, and select options.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ICON_MAP } from './icons';
import type { ServiceChatConfig, ToolOption } from './types';

interface Props {
  config: ServiceChatConfig;
  isOpen: boolean;
  activePanel: string | null;
  language: string;
  selectedOptions: Record<string, unknown>;
  onSetOption: (key: string, value: unknown) => void;
  onClose: () => void;
}

export function ServiceToolPanel({
  config, isOpen, activePanel, language,
  selectedOptions, onSetOption, onClose,
}: Props) {
  const lang = (language || 'en') as 'en' | 'ka' | 'ru';
  const panel = config.toolPanels.find((p) => p.id === activePanel) || config.toolPanels[0];

  if (!panel || !isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden flex-shrink-0"
          style={{ borderBottom: '1px solid var(--color-border)' }}
        >
          <div className="px-4 py-3 space-y-3">
            {/* Panel header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(() => { const Icon = ICON_MAP[panel.icon]; return Icon ? <Icon className="w-3.5 h-3.5" style={{ color: config.accentColor }} /> : null; })()}
                <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text)' }}>
                  {panel.label[lang] || panel.label.en}
                </span>
              </div>
              <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5" style={{ color: 'var(--color-text-tertiary)' }}>
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Options */}
            {panel.options.map((opt) => (
              <ToolOptionRow
                key={opt.id}
                option={opt}
                lang={lang}
                accentColor={config.accentColor}
                value={selectedOptions[opt.id] ?? opt.defaultValue}
                onChange={(v) => onSetOption(opt.id, v)}
              />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function ToolOptionRow({
  option, lang, accentColor, value, onChange,
}: {
  option: ToolOption;
  lang: 'en' | 'ka' | 'ru';
  accentColor: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = option.label[lang] || option.label.en;

  switch (option.type) {
    case 'chips': {
      const selectedChip = option.options?.find((opt) => value === opt.value);
      return (
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</label>
          <div className="flex flex-wrap gap-1.5">
            {option.options?.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onChange(opt.value)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={{
                    background: isSelected ? `${accentColor}20` : 'rgba(255,255,255,0.04)',
                    color: isSelected ? accentColor : 'var(--color-text-secondary)',
                    border: `1px solid ${isSelected ? `${accentColor}40` : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  {opt.label[lang] || opt.label.en}
                  {typeof opt.credits === 'number' ? ` · ${opt.credits} cr` : ''}
                </button>
              );
            })}
          </div>
          {typeof selectedChip?.credits === 'number' && (
            <p className="text-[10px]" style={{ color: accentColor }}>
              {selectedChip.credits} credits
            </p>
          )}
        </div>
      );
    }

    case 'toggle':
      return (
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</label>
          <button
            onClick={() => onChange(!value)}
            className="relative w-10 h-5 rounded-full transition-colors"
            style={{
              background: value ? `${accentColor}40` : 'rgba(255,255,255,0.08)',
            }}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{
                left: value ? '22px' : '2px',
                background: value ? accentColor : 'rgba(255,255,255,0.3)',
                boxShadow: value ? `0 0 8px ${accentColor}40` : 'none',
              }}
            />
          </button>
        </div>
      );

    case 'slider':
      return (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium" style={{ color: 'var(--color-text-tertiary)' }}>{label}</label>
            <span className="text-[11px] font-mono" style={{ color: accentColor }}>
              {String(value ?? option.defaultValue)}
            </span>
          </div>
          <input
            type="range"
            min={option.min ?? 0}
            max={option.max ?? 100}
            step={option.step ?? 1}
            value={Number(value ?? option.defaultValue ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, ${accentColor} 0%, ${accentColor} ${((Number(value ?? option.defaultValue ?? 0) - (option.min ?? 0)) / ((option.max ?? 100) - (option.min ?? 0))) * 100}%, rgba(255,255,255,0.08) ${((Number(value ?? option.defaultValue ?? 0) - (option.min ?? 0)) / ((option.max ?? 100) - (option.min ?? 0))) * 100}%, rgba(255,255,255,0.08) 100%)`,
            }}
          />
        </div>
      );

    default:
      return null;
  }
}
