'use client';

import { PIPELINE_SERVICES_MAP } from '@/lib/workflows/pipeline-services';
import type { PipelineStep } from './types';

/* ─── i18n ─────────────────────────────────────────────────────────────── */
const L = {
  en: {
    configTitle: 'Step Configuration',
    prompt: 'Prompt',
    promptHint: 'Describe what this step should do',
    parameters: 'Parameters',
    retryPolicy: 'Retry Policy',
    maxRetries: 'Max Retries',
    backoffMs: 'Backoff (ms)',
    inputTypes: 'Accepts',
    outputTypes: 'Produces',
    actions: 'Actions',
    moveUp: '↑ Move Up',
    moveDown: '↓ Move Down',
    duplicate: 'Duplicate',
    remove: 'Remove Step',
    close: 'Close',
    dataFlow: 'Data Flow',
    fromPrevious: 'From previous step',
    fromTrigger: 'From pipeline input',
  },
  ka: {
    configTitle: 'ნაბიჯის კონფიგურაცია',
    prompt: 'პრომფტი',
    promptHint: 'აღწერე რა უნდა გააკეთოს ამ ნაბიჯმა',
    parameters: 'პარამეტრები',
    retryPolicy: 'თავიდან ცდის პოლიტიკა',
    maxRetries: 'მაქს. ცდები',
    backoffMs: 'დაყოვნება (ms)',
    inputTypes: 'იღებს',
    outputTypes: 'აწარმოებს',
    actions: 'მოქმედებები',
    moveUp: '↑ ზემოთ',
    moveDown: '↓ ქვემოთ',
    duplicate: 'დუბლირება',
    remove: 'ნაბიჯის წაშლა',
    close: 'დახურვა',
    dataFlow: 'მონაცემთა ნაკადი',
    fromPrevious: 'წინა ნაბიჯიდან',
    fromTrigger: 'პაიპლაინის შეტანიდან',
  },
  ru: {
    configTitle: 'Настройка шага',
    prompt: 'Промпт',
    promptHint: 'Опишите, что должен сделать этот шаг',
    parameters: 'Параметры',
    retryPolicy: 'Политика повторов',
    maxRetries: 'Макс. повторов',
    backoffMs: 'Задержка (мс)',
    inputTypes: 'Принимает',
    outputTypes: 'Выдаёт',
    actions: 'Действия',
    moveUp: '↑ Вверх',
    moveDown: '↓ Вниз',
    duplicate: 'Дубль',
    remove: 'Удалить шаг',
    close: 'Закрыть',
    dataFlow: 'Поток данных',
    fromPrevious: 'Из предыдущего шага',
    fromTrigger: 'Из входа пайплайна',
  },
};

interface StepConfiguratorProps {
  step: PipelineStep;
  stepIndex: number;
  totalSteps: number;
  lang: 'en' | 'ka' | 'ru';
  onUpdate: (patch: Partial<PipelineStep>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onClose: () => void;
}

export default function StepConfigurator({
  step,
  stepIndex,
  totalSteps,
  lang,
  onUpdate,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onClose,
}: StepConfiguratorProps) {
  const t = L[lang] ?? L.en;
  const svc = PIPELINE_SERVICES_MAP.get(step.serviceId);

  if (!svc) return null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
          style={{ backgroundColor: svc.accent + '20', color: svc.accent }}
        >
          {svc.icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>
            {svc.name[lang] ?? svc.name.en}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
            {t.configTitle} · #{stepIndex + 1}/{totalSteps}
          </div>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm transition-colors hover:opacity-80"
          style={{ color: 'var(--color-text-tertiary)' }}
        >
          ×
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Data flow info */}
        <Section title={t.dataFlow} accent={svc.accent}>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: svc.accent + '15', color: svc.accent }}
              >
                {t.inputTypes}
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {svc.inputTypes.join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium"
                style={{ backgroundColor: svc.accent + '15', color: svc.accent }}
              >
                {t.outputTypes}
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>
                {svc.outputTypes.join(', ')}
              </span>
            </div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>
              {stepIndex === 0 ? t.fromTrigger : t.fromPrevious}
            </div>
          </div>
        </Section>

        {/* Prompt */}
        <Section title={t.prompt}>
          <textarea
            value={step.prompt}
            onChange={(e) => onUpdate({ prompt: e.target.value })}
            placeholder={t.promptHint}
            rows={4}
            className="w-full px-3 py-2 rounded-lg text-xs border resize-none outline-none transition-colors focus:border-opacity-60"
            style={{
              backgroundColor: 'var(--color-bg)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </Section>

        {/* Parameters */}
        {svc.parameterPresets.length > 0 && (
          <Section title={t.parameters}>
            <div className="space-y-3">
              {svc.parameterPresets.map((preset) => (
                <div key={preset.key}>
                  <label
                    className="text-[10px] font-medium uppercase tracking-wider mb-1 block"
                    style={{ color: 'var(--color-text-tertiary)' }}
                  >
                    {preset.label}
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {preset.values.map((val) => (
                      <button
                        key={val}
                        onClick={() =>
                          onUpdate({
                            parameters: { ...step.parameters, [preset.key]: val },
                          })
                        }
                        className="px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all"
                        style={{
                          backgroundColor:
                            step.parameters[preset.key] === val
                              ? svc.accent + '20'
                              : 'transparent',
                          borderColor:
                            step.parameters[preset.key] === val
                              ? svc.accent
                              : 'var(--color-border)',
                          color:
                            step.parameters[preset.key] === val
                              ? svc.accent
                              : 'var(--color-text-secondary)',
                        }}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Retry Policy */}
        <Section title={t.retryPolicy}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                className="text-[10px] font-medium uppercase tracking-wider mb-1 block"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t.maxRetries}
              </label>
              <select
                value={step.retryPolicy.maxRetries}
                onChange={(e) =>
                  onUpdate({
                    retryPolicy: {
                      ...step.retryPolicy,
                      maxRetries: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-2 py-1.5 rounded-md text-xs border outline-none"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="text-[10px] font-medium uppercase tracking-wider mb-1 block"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {t.backoffMs}
              </label>
              <select
                value={step.retryPolicy.backoffMs}
                onChange={(e) =>
                  onUpdate({
                    retryPolicy: {
                      ...step.retryPolicy,
                      backoffMs: Number(e.target.value),
                    },
                  })
                }
                className="w-full px-2 py-1.5 rounded-md text-xs border outline-none"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
              >
                {[1000, 2000, 5000, 10000, 30000, 60000].map((ms) => (
                  <option key={ms} value={ms}>
                    {ms >= 1000 ? `${ms / 1000}s` : `${ms}ms`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* Actions */}
        <Section title={t.actions}>
          <div className="space-y-1.5">
            {onMoveUp && (
              <ActionButton label={t.moveUp} onClick={onMoveUp} />
            )}
            {onMoveDown && (
              <ActionButton label={t.moveDown} onClick={onMoveDown} />
            )}
            <ActionButton label={t.duplicate} onClick={onDuplicate} />
            <ActionButton label={t.remove} onClick={onRemove} danger />
          </div>
        </Section>
      </div>
    </div>
  );
}

/* ─── Sub‑components ───────────────────────────────────────────────────── */

function Section({
  title,
  accent,
  children,
}: {
  title: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4
        className="text-[10px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: accent ?? 'var(--color-text-tertiary)' }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium border transition-all hover:opacity-80"
      style={{
        borderColor: danger ? '#ef444430' : 'var(--color-border)',
        color: danger ? '#ef4444' : 'var(--color-text-secondary)',
        backgroundColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}
