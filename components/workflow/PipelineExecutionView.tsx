'use client';

import { useEffect, useRef } from 'react';
import { PIPELINE_SERVICES_MAP } from '@/lib/workflows/pipeline-services';
import type { PipelineStep } from './types';
import type { PipelineRunState } from './types';

/* ─── i18n ─────────────────────────────────────────────────────────────── */
const L = {
  en: {
    running: 'Pipeline Running',
    completed: 'Pipeline Complete',
    failed: 'Pipeline Failed',
    cancelled: 'Pipeline Cancelled',
    queued: 'Queued',
    processing: 'Processing…',
    step_completed: 'Completed',
    step_failed: 'Failed',
    logs: 'Execution Log',
    noLogs: 'Waiting for events…',
    credits: 'credits',
    duration: 'Duration',
    results: 'Results',
    waitingToStart: 'Pipeline is queued and will start shortly…',
  },
  ka: {
    running: 'პაიპლაინი მიმდინარეობს',
    completed: 'პაიპლაინი დასრულდა',
    failed: 'პაიპლაინი ვერ შესრულდა',
    cancelled: 'პაიპლაინი გაუქმდა',
    queued: 'რიგში',
    processing: 'მუშავდება…',
    step_completed: 'დასრულდა',
    step_failed: 'ვერ შესრულდა',
    logs: 'შესრულების ჟურნალი',
    noLogs: 'მოვლენების მოლოდინი…',
    credits: 'კრედიტი',
    duration: 'ხანგრძლივობა',
    results: 'შედეგები',
    waitingToStart: 'პაიპლაინი რიგშია და მალე დაიწყება…',
  },
  ru: {
    running: 'Пайплайн выполняется',
    completed: 'Пайплайн завершён',
    failed: 'Пайплайн не выполнен',
    cancelled: 'Пайплайн отменён',
    queued: 'В очереди',
    processing: 'Обработка…',
    step_completed: 'Завершён',
    step_failed: 'Ошибка',
    logs: 'Журнал выполнения',
    noLogs: 'Ожидание событий…',
    credits: 'кредитов',
    duration: 'Длительность',
    results: 'Результаты',
    waitingToStart: 'Пайплайн поставлен в очередь и скоро начнётся…',
  },
};

const STATUS_CONFIG = {
  queued: { color: '#94a3b8', bg: '#94a3b815', icon: '○' },
  running: { color: '#60a5fa', bg: '#60a5fa15', icon: '◉' },
  processing: { color: '#60a5fa', bg: '#60a5fa15', icon: '◉' },
  completed: { color: '#4ade80', bg: '#4ade8015', icon: '✓' },
  failed: { color: '#ef4444', bg: '#ef444415', icon: '✕' },
  cancelled: { color: '#fbbf24', bg: '#fbbf2415', icon: '⊘' },
};

interface PipelineExecutionViewProps {
  steps: PipelineStep[];
  runState: PipelineRunState;
  lang: 'en' | 'ka' | 'ru';
}

export default function PipelineExecutionView({
  steps,
  runState,
  lang,
}: PipelineExecutionViewProps) {
  const t = L[lang] ?? L.en;
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [runState.logs.length]);

  const pipelineStatus = STATUS_CONFIG[runState.status] ?? STATUS_CONFIG.queued;
  const statusLabel =
    runState.status === 'running'
      ? t.running
      : runState.status === 'completed'
      ? t.completed
      : runState.status === 'failed'
      ? t.failed
      : runState.status === 'cancelled'
      ? t.cancelled
      : t.queued;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Pipeline status header */}
      <div
        className="rounded-2xl border p-6"
        style={{
          backgroundColor: pipelineStatus.bg,
          borderColor: pipelineStatus.color + '30',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold"
            style={{ color: pipelineStatus.color }}
          >
            {pipelineStatus.icon}
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>
              {statusLabel}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {runState.status === 'queued' && t.waitingToStart}
              {runState.status === 'running' && (
                <>
                  {runState.steps.filter((s) => s.status === 'completed').length}/
                  {runState.steps.length} {t.step_completed.toLowerCase()}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {(runState.status === 'running' || runState.status === 'queued') && (
          <div className="mt-4">
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: 'var(--color-border)' }}
            >
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${
                    (runState.steps.filter((s) => s.status === 'completed').length /
                      Math.max(runState.steps.length, 1)) *
                    100
                  }%`,
                  backgroundColor: pipelineStatus.color,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Step cards */}
      <div className="space-y-3">
        {steps.map((step, idx) => {
          const svc = PIPELINE_SERVICES_MAP.get(step.serviceId);
          const stepRun = runState.steps.find((s) => s.stepId === step.id);
          const status = stepRun?.status ?? 'queued';
          const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.queued;

          return (
            <div
              key={step.id}
              className="rounded-xl border p-4 transition-all"
              style={{
                borderColor:
                  status === 'processing' ? cfg.color + '60' : 'var(--color-border)',
                backgroundColor:
                  status === 'processing' ? cfg.bg : 'var(--card-bg)',
                boxShadow:
                  status === 'processing' ? `0 0 20px ${cfg.color}15` : undefined,
              }}
            >
              <div className="flex items-center gap-3">
                {/* Step number + status */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: cfg.bg, color: cfg.color }}
                >
                  {status === 'completed'
                    ? '✓'
                    : status === 'failed'
                    ? '✕'
                    : status === 'processing'
                    ? '⟳'
                    : idx + 1}
                </div>

                {/* Service info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {svc && (
                      <span
                        className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: svc.accent + '20', color: svc.accent }}
                      >
                        {svc.icon}
                      </span>
                    )}
                    <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                      {svc?.name[lang] ?? svc?.name.en ?? step.serviceId}
                    </span>
                  </div>
                  <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-tertiary)' }}>
                    {step.prompt.slice(0, 80)}
                  </p>
                </div>

                {/* Status badge */}
                <div className="shrink-0">
                  <span
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: cfg.bg, color: cfg.color }}
                  >
                    {status === 'queued'
                      ? t.queued
                      : status === 'processing'
                      ? t.processing
                      : status === 'completed'
                      ? t.step_completed
                      : t.step_failed}
                  </span>
                </div>
              </div>

              {/* Error message */}
              {stepRun?.errorMessage && (
                <div
                  className="mt-2 px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: '#ef444410', color: '#ef4444' }}
                >
                  {stepRun.errorMessage}
                </div>
              )}

              {/* Metrics */}
              {status === 'completed' && (stepRun?.executionMs || stepRun?.costCredits) && (
                <div className="flex items-center gap-4 mt-2 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                  {stepRun.executionMs != null && (
                    <span>
                      {t.duration}: {(stepRun.executionMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {stepRun.costCredits != null && stepRun.costCredits > 0 && (
                    <span>
                      {stepRun.costCredits} {t.credits}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Execution log */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--card-bg)' }}
      >
        <div
          className="px-4 py-2.5 border-b text-xs font-semibold uppercase tracking-wider"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-tertiary)' }}
        >
          {t.logs}
        </div>
        <div ref={logRef} className="max-h-48 overflow-y-auto p-4 space-y-1">
          {runState.logs.length === 0 ? (
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {t.noLogs}
            </p>
          ) : (
            runState.logs.map((log, i) => {
              const levelColor =
                log.level === 'error'
                  ? '#ef4444'
                  : log.level === 'warn'
                  ? '#fbbf24'
                  : 'var(--color-text-tertiary)';
              return (
                <div key={i} className="flex items-start gap-2 text-xs font-mono">
                  <span className="shrink-0 text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                    {new Date(log.at).toLocaleTimeString()}
                  </span>
                  <span style={{ color: levelColor }}>{log.message}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
