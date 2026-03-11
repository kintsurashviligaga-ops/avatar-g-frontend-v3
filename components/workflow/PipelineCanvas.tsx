'use client';

import { useRef, useCallback } from 'react';
import { PIPELINE_SERVICES_MAP } from '@/lib/workflows/pipeline-services';
import type { PipelineStep } from './types';

/* ─── i18n ─────────────────────────────────────────────────────────────── */
const L = {
  en: { input: 'Input', output: 'Output', step: 'Step', remove: 'Remove', addStep: 'Add step' },
  ka: { input: 'შეტანა', output: 'გამოტანა', step: 'ნაბიჯი', remove: 'წაშლა', addStep: 'ნაბიჯის დამატება' },
  ru: { input: 'Вход', output: 'Выход', step: 'Шаг', remove: 'Удалить', addStep: 'Добавить шаг' },
};

interface PipelineCanvasProps {
  steps: PipelineStep[];
  selectedIdx: number | null;
  lang: 'en' | 'ka' | 'ru';
  onSelect: (idx: number) => void;
  onRemove: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  onAddAfter: (idx: number) => void;
}

export default function PipelineCanvas({
  steps,
  selectedIdx,
  lang,
  onSelect,
  onRemove,
  onMove,
  onAddAfter,
}: PipelineCanvasProps) {
  const t = L[lang] ?? L.en;
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<number | null>(null);

  const handleDragStart = useCallback((idx: number) => {
    dragRef.current = idx;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, toIdx: number) => {
      e.preventDefault();
      const fromIdx = dragRef.current;
      if (fromIdx !== null && fromIdx !== toIdx) {
        onMove(fromIdx, toIdx);
      }
      dragRef.current = null;
    },
    [onMove]
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Pipeline summary bar */}
      <div
        className="flex items-center gap-3 px-5 py-2.5 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
          {steps.length} {t.step}{steps.length !== 1 ? 's' : ''}
        </span>
        <div className="flex-1" />
        {/* Data type flow summary */}
        <div className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
          {steps.map((step, i) => {
            const svc = PIPELINE_SERVICES_MAP.get(step.serviceId);
            if (!svc) return null;
            return (
              <span key={step.id} className="flex items-center gap-1">
                <span
                  className="px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: svc.accent + '15', color: svc.accent }}
                >
                  {svc.shortName}
                </span>
                {i < steps.length - 1 && <span>→</span>}
              </span>
            );
          })}
        </div>
      </div>

      {/* Scrollable canvas */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-6">
        <div className="flex items-start gap-0 min-w-max">
          {/* Trigger node */}
          <div className="flex flex-col items-center mr-2">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold border-2"
              style={{
                borderColor: 'var(--color-accent)',
                backgroundColor: 'var(--color-accent)' + '15',
                color: 'var(--color-accent)',
              }}
            >
              ▷
            </div>
            <span className="text-[10px] font-medium mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.input}
            </span>
          </div>

          {/* Connection arrow from trigger */}
          <ConnectionArrow />

          {/* Step nodes */}
          {steps.map((step, idx) => {
            const svc = PIPELINE_SERVICES_MAP.get(step.serviceId);
            if (!svc) return null;
            const isSelected = selectedIdx === idx;

            return (
              <div key={step.id} className="flex items-start gap-0">
                {/* Step node */}
                <div
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onClick={() => onSelect(idx)}
                  className="flex flex-col items-center cursor-pointer group relative"
                  style={{ minWidth: 120 }}
                >
                  {/* Step number badge */}
                  <div
                    className="absolute -top-2 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold z-10"
                    style={{
                      backgroundColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                      color: isSelected ? '#fff' : 'var(--color-text-tertiary)',
                    }}
                  >
                    {idx + 1}
                  </div>

                  {/* Main node */}
                  <div
                    className="w-24 rounded-2xl border-2 p-3 transition-all group-hover:shadow-lg"
                    style={{
                      borderColor: isSelected ? svc.accent : 'var(--color-border)',
                      backgroundColor: isSelected ? svc.accent + '10' : 'var(--card-bg)',
                      boxShadow: isSelected ? `0 0 20px ${svc.accent}20` : undefined,
                    }}
                  >
                    {/* Icon */}
                    <div
                      className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-xl font-bold mb-2 transition-transform group-hover:scale-110"
                      style={{ backgroundColor: svc.accent + '20', color: svc.accent }}
                    >
                      {svc.icon}
                    </div>

                    {/* Name */}
                    <div
                      className="text-xs font-semibold text-center truncate"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {svc.shortName}
                    </div>

                    {/* Data types */}
                    <div className="flex items-center justify-center gap-0.5 mt-1">
                      {svc.outputTypes.slice(0, 2).map((ot, i) => (
                        <span
                          key={i}
                          className="text-[8px] px-1 rounded"
                          style={{ backgroundColor: svc.accent + '15', color: svc.accent }}
                        >
                          {ot}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Prompt preview */}
                  <div
                    className="mt-1.5 max-w-[120px] text-center text-[9px] leading-tight line-clamp-2"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {step.prompt.slice(0, 60)}
                  </div>

                  {/* Remove button (on hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(idx);
                    }}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text-tertiary)',
                      border: '1px solid var(--color-border)',
                    }}
                    title={t.remove}
                  >
                    ×
                  </button>
                </div>

                {/* Connection arrow to next step */}
                {idx < steps.length - 1 && <ConnectionArrow />}
              </div>
            );
          })}

          {/* Connection arrow to output */}
          <ConnectionArrow />

          {/* Output node */}
          <div className="flex flex-col items-center ml-2">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold border-2 border-dashed"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              ◎
            </div>
            <span className="text-[10px] font-medium mt-1.5" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.output}
            </span>
          </div>
        </div>

        {/* Compatibility hints */}
        {steps.length >= 2 && (
          <div className="mt-8 space-y-1">
            {steps.slice(1).map((step, i) => {
              const prevStep = steps[i];
              if (!prevStep) return null;
              const prevSvc = PIPELINE_SERVICES_MAP.get(prevStep.serviceId);
              const currSvc = PIPELINE_SERVICES_MAP.get(step.serviceId);
              if (!prevSvc || !currSvc) return null;

              const hasMatch = prevSvc.outputTypes.some(
                (ot) => currSvc.inputTypes.includes(ot) || currSvc.inputTypes.includes('any')
              );

              if (hasMatch) return null;

              return (
                <div
                  key={step.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
                  style={{
                    backgroundColor: '#fbbf2415',
                    color: '#fbbf24',
                    border: '1px solid #fbbf2430',
                  }}
                >
                  <span>⚠</span>
                  <span>
                    {prevSvc.shortName} outputs [{prevSvc.outputTypes.join(', ')}] but{' '}
                    {currSvc.shortName} expects [{currSvc.inputTypes.join(', ')}]
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Connection Arrow ─────────────────────────────────────────────────── */

function ConnectionArrow() {
  return (
    <div className="flex items-center self-center mt-4" style={{ height: 56 }}>
      <div className="flex items-center">
        <div
          className="w-8 h-px"
          style={{ backgroundColor: 'var(--color-border)' }}
        />
        <div
          className="w-0 h-0"
          style={{
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderLeft: '6px solid var(--color-border)',
          }}
        />
      </div>
    </div>
  );
}
