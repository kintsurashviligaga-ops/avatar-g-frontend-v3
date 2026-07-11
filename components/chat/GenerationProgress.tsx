'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ServiceId } from '@/lib/registry';
import { SERVICE_REGISTRY } from '@/lib/registry';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GenerationStage =
  | 'received'
  | 'processing'
  | 'generating'
  | 'optimizing'
  | 'delivering';

export interface GenerationProgressProps {
  service: ServiceId;
  stage: GenerationStage;
  estimatedSeconds: number;
  creditCost: number;
  locale?: string;
  onCancel?: () => void;
  cancelled?: boolean;
}

// ─── Stage config ─────────────────────────────────────────────────────────────

const STAGE_ORDER: GenerationStage[] = [
  'received',
  'processing',
  'generating',
  'optimizing',
  'delivering',
];

const STAGE_ICONS: Record<GenerationStage, string> = {
  received:   '📥',
  processing: '⚙️',
  generating: '✨',
  optimizing: '🔬',
  delivering: '📦',
};

function stageLabel(stage: GenerationStage, locale: string): string {
  const map: Record<GenerationStage, Record<string, string>> = {
    received:   { ka: 'მიღებულია', en: 'Received', ru: 'Получено' },
    processing: { ka: 'დამუშავება', en: 'Processing', ru: 'Обработка' },
    generating: { ka: 'გენერაცია', en: 'Generating', ru: 'Генерация' },
    optimizing: { ka: 'ოპტიმიზაცია', en: 'Optimizing', ru: 'Оптимизация' },
    delivering: { ka: 'მიწოდება', en: 'Delivering', ru: 'Доставка' },
  };
  return map[stage]?.[locale] ?? map[stage]?.['en'] ?? stage;
}

function t(key: string, locale: string): string {
  const strings: Record<string, Record<string, string>> = {
    generating:     { ka: 'მიმდინარეობს გენერაცია...', en: 'Generating...', ru: 'Генерация...' },
    cancel:         { ka: 'გაუქმება', en: 'Cancel', ru: 'Отмена' },
    cancelling:     { ka: 'გაუქმება...', en: 'Cancelling...', ru: 'Отмена...' },
    cancelled:      { ka: 'გაუქმდა', en: 'Cancelled', ru: 'Отменено' },
    timeRemaining:  { ka: 'დარჩენილი დრო', en: 'Time remaining', ru: 'Оставшееся время' },
    credits:        { ka: 'კრ.', en: 'cr.', ru: 'кр.' },
  };
  return strings[key]?.[locale] ?? strings[key]?.['en'] ?? key;
}

// ─── Countdown ────────────────────────────────────────────────────────────────

function useCountdown(totalSeconds: number, paused: boolean) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (paused) return;
    ref.current = setInterval(() => {
      setRemaining(r => Math.max(0, r - 1));
    }, 1000);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [paused]);

  return remaining;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function GenerationProgress({
  service,
  stage,
  estimatedSeconds,
  creditCost,
  locale = 'ka',
  onCancel,
  cancelled = false,
}: GenerationProgressProps) {
  const [cancelling, setCancelling] = useState(false);
  const remaining = useCountdown(estimatedSeconds, cancelled || stage === 'delivering');

  const serviceInfo = SERVICE_REGISTRY.find(s => s.id === service);
  const serviceName = serviceInfo
    ? (typeof serviceInfo.name === 'object'
        ? (serviceInfo.name as Record<string, string>)[locale] ?? (serviceInfo.name as Record<string, string>)['en']
        : String(serviceInfo.name))
    : service;

  const currentIndex = STAGE_ORDER.indexOf(stage);
  const progress = ((currentIndex + 1) / STAGE_ORDER.length) * 100;

  const handleCancel = () => {
    setCancelling(true);
    onCancel?.();
  };

  const displaySeconds = remaining > 0
    ? (remaining < 60
        ? (locale === 'ka' ? `${remaining} წმ` : locale === 'ru' ? `${remaining} с` : `${remaining}s`)
        : (locale === 'ka' ? `${Math.ceil(remaining / 60)} წთ` : locale === 'ru' ? `${Math.ceil(remaining / 60)} мин` : `${Math.ceil(remaining / 60)}m`))
    : '...';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex h-9 w-9 items-center justify-center">
          <motion.div
            className="absolute inset-0 rounded-full border border-cyan-400/30"
            animate={{ rotate: cancelled ? 0 : 360 }}
            transition={{ duration: 2, repeat: cancelled ? 0 : Infinity, ease: 'linear' }}
          />
          <span className="text-sm">{serviceInfo?.icon}</span>
        </div>
        <div>
          <p className="text-xs text-white/40">{serviceName}</p>
          <p className="text-sm font-semibold text-white">
            {cancelled ? t('cancelled', locale) : t('generating', locale)}
          </p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-[10px] text-white/30">{t('timeRemaining', locale)}</p>
          <p className="text-sm font-bold text-cyan-300">{cancelled ? '—' : displaySeconds}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div
          className={cn(
            'h-full rounded-full',
            cancelled ? 'bg-rose-400/60' : 'bg-gradient-to-r from-cyan-500 to-cyan-300',
          )}
          initial={{ width: 0 }}
          animate={{ width: cancelled ? '100%' : `${progress}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>

      {/* Stage list */}
      <div className="mb-4 space-y-2">
        {STAGE_ORDER.map((s, i) => {
          const isDone    = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isPending = i > currentIndex;

          return (
            <div key={s} className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] transition-all',
                  isDone    && 'bg-cyan-400/20 text-cyan-300',
                  isCurrent && !cancelled && 'bg-cyan-400/30 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.4)]',
                  isCurrent && cancelled  && 'bg-rose-400/20 text-rose-300',
                  isPending  && 'bg-white/5 text-white/20',
                )}
              >
                {isDone ? '✓' : STAGE_ICONS[s]}
              </div>
              <span
                className={cn(
                  'text-xs transition-all',
                  isDone    && 'text-cyan-300/70',
                  isCurrent && !cancelled && 'font-semibold text-white',
                  isCurrent && cancelled  && 'font-semibold text-rose-300',
                  isPending  && 'text-white/25',
                )}
              >
                {stageLabel(s, locale)}
              </span>
              {isCurrent && !cancelled && (
                <motion.span
                  className="ml-auto flex gap-0.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {[0, 1, 2].map(dot => (
                    <motion.span
                      key={dot}
                      className="inline-block h-1 w-1 rounded-full bg-cyan-400"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.2 }}
                    />
                  ))}
                </motion.span>
              )}
            </div>
          );
        })}
      </div>

      {/* Credit badge */}
      <div className="mb-4 flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] py-2">
        <span className="text-[10px] text-white/30">
          {locale === 'ka' ? 'ჩამოაკლდება' : locale === 'ru' ? 'Будет списано' : 'Will deduct'}
        </span>
        <span className="text-xs font-bold text-amber-300">
          {creditCost} {t('credits', locale)}
        </span>
      </div>

      {/* Cancel button */}
      <AnimatePresence>
        {!cancelled && onCancel && (
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancel}
            disabled={cancelling}
            className={cn(
              'w-full rounded-xl border py-2.5 text-xs font-medium transition',
              cancelling
                ? 'cursor-not-allowed border-white/5 text-white/20'
                : 'border-rose-400/20 text-rose-400/70 hover:border-rose-400/40 hover:bg-rose-400/5 hover:text-rose-300',
            )}
          >
            {cancelling ? t('cancelling', locale) : t('cancel', locale)}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
