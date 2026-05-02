'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ServiceId } from '@/lib/registry';
import { SERVICE_REGISTRY } from '@/lib/registry';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConfirmationCardProps {
  service: ServiceId;
  answers: Record<string, string | string[]>;
  finalPrompt: string;
  creditCost: number;
  userBalance: number;
  estimatedSeconds: number;
  locale?: string;
  onEdit: (field: 'prompt' | 'answers') => void;
  onGenerate: () => void;
  onCancel: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSeconds(s: number, locale: string): string {
  if (s < 60) {
    return locale === 'ka' ? `~${s} წმ` : locale === 'ru' ? `~${s} с` : `~${s}s`;
  }
  const m = Math.ceil(s / 60);
  return locale === 'ka' ? `~${m} წთ` : locale === 'ru' ? `~${m} мин` : `~${m}m`;
}

function t(key: string, locale: string): string {
  const strings: Record<string, Record<string, string>> = {
    generationPlan: { ka: 'გენერაციის გეგმა', en: 'Generation Plan', ru: 'План генерации' },
    finalPrompt:    { ka: 'საბოლოო Prompt', en: 'Final Prompt', ru: 'Финальный промпт' },
    creditCost:     { ka: 'კრედიტის ღირებულება', en: 'Credit Cost', ru: 'Стоимость кредитов' },
    yourBalance:    { ka: 'თქვენი ბალანსი', en: 'Your Balance', ru: 'Ваш баланс' },
    remaining:      { ka: 'დარჩება', en: 'Remaining', ru: 'Останется' },
    estimatedTime:  { ka: 'სავარაუდო დრო', en: 'Estimated Time', ru: 'Примерное время' },
    editPrompt:     { ka: 'Prompt-ის შეცვლა', en: 'Edit Prompt', ru: 'Изменить промпт' },
    editAnswers:    { ka: 'პასუხების შეცვლა', en: 'Edit Answers', ru: 'Изменить ответы' },
    generate:       { ka: 'გენერაცია', en: 'Generate', ru: 'Генерировать' },
    cancel:         { ka: 'გაუქმება', en: 'Cancel', ru: 'Отмена' },
    insufficientCredits: {
      ka: 'არ გაქვს საკმარისი კრედიტი',
      en: 'Insufficient credits',
      ru: 'Недостаточно кредитов',
    },
    credits: { ka: 'კრ.', en: 'cr.', ru: 'кр.' },
    selectedOptions: { ka: 'არჩეული პარამეტრები', en: 'Selected Options', ru: 'Выбранные параметры' },
  };
  return strings[key]?.[locale] ?? strings[key]?.['en'] ?? key;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ConfirmationCard({
  service,
  answers,
  finalPrompt,
  creditCost,
  userBalance,
  estimatedSeconds,
  locale = 'ka',
  onEdit,
  onGenerate,
  onCancel,
}: ConfirmationCardProps) {
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(finalPrompt);

  const serviceInfo = SERVICE_REGISTRY.find(s => s.id === service);
  const serviceName = serviceInfo
    ? (typeof serviceInfo.name === 'object' ? (serviceInfo.name as Record<string, string>)[locale] ?? serviceInfo.name['en'] : String(serviceInfo.name))
    : service;

  const remaining = userBalance - creditCost;
  const canGenerate = userBalance >= creditCost;

  const answerEntries = Object.entries(answers).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : Boolean(v),
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{serviceInfo?.icon}</span>
          <div>
            <p className="text-xs font-semibold text-white/50">{t('generationPlan', locale)}</p>
            <p className="text-sm font-bold text-white">{serviceName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full p-1.5 text-white/30 transition hover:bg-white/10 hover:text-white/60"
          aria-label="cancel"
        >
          ✕
        </button>
      </div>

      {/* Answers summary */}
      {answerEntries.length > 0 && (
        <div className="mb-4 rounded-xl border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              {t('selectedOptions', locale)}
            </p>
            <button
              type="button"
              onClick={() => onEdit('answers')}
              className="text-[10px] text-cyan-400/70 hover:text-cyan-300 transition"
            >
              ✏️ {t('editAnswers', locale)}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {answerEntries.map(([key, value]) => (
              <span
                key={key}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] text-white/60"
              >
                {Array.isArray(value) ? value.join(', ') : value}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Final Prompt */}
      <div className="mb-4">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            {t('finalPrompt', locale)}
          </p>
          <button
            type="button"
            onClick={() => {
              if (editingPrompt) {
                onEdit('prompt');
              }
              setEditingPrompt(p => !p);
            }}
            className="text-[10px] text-cyan-400/70 hover:text-cyan-300 transition"
          >
            ✏️ {t('editPrompt', locale)}
          </button>
        </div>
        {editingPrompt ? (
          <textarea
            value={localPrompt}
            onChange={e => setLocalPrompt(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-cyan-400/30 bg-white/[0.04] p-3 text-xs text-white/80 outline-none focus:border-cyan-400/60 resize-none"
          />
        ) : (
          <p className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-xs leading-relaxed text-white/70 line-clamp-4">
            {localPrompt}
          </p>
        )}
      </div>

      {/* Cost breakdown */}
      <div className="mb-5 grid grid-cols-3 gap-2">
        {[
          {
            label: t('creditCost', locale),
            value: `${creditCost} ${t('credits', locale)}`,
            color: 'text-amber-300',
          },
          {
            label: t('yourBalance', locale),
            value: `${userBalance} ${t('credits', locale)}`,
            color: 'text-white/80',
          },
          {
            label: t('remaining', locale),
            value: `${remaining} ${t('credits', locale)}`,
            color: remaining >= 0 ? 'text-emerald-300' : 'text-rose-400',
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-center"
          >
            <p className="mb-0.5 text-[9px] text-white/40">{label}</p>
            <p className={cn('text-xs font-bold', color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Time estimate */}
      <div className="mb-5 flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
        <span className="text-sm">⏱</span>
        <p className="text-xs text-white/50">{t('estimatedTime', locale)}</p>
        <p className="ml-auto text-xs font-semibold text-cyan-300">
          {formatSeconds(estimatedSeconds, locale)}
        </p>
      </div>

      {/* Insufficient credits warning */}
      {!canGenerate && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-3 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-center text-xs text-rose-300"
        >
          ⚠️ {t('insufficientCredits', locale)}
        </motion.p>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-xl border border-white/10 bg-white/[0.03] py-2.5 text-xs font-medium text-white/50 transition hover:border-white/20 hover:text-white/70"
        >
          {t('cancel', locale)}
        </button>
        <motion.button
          type="button"
          whileTap={canGenerate ? { scale: 0.97 } : {}}
          onClick={canGenerate ? onGenerate : undefined}
          disabled={!canGenerate}
          className={cn(
            'flex-[2] rounded-xl py-2.5 text-xs font-bold transition',
            canGenerate
              ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-black shadow-[0_0_16px_rgba(34,211,238,0.4)] hover:shadow-[0_0_20px_rgba(34,211,238,0.6)]'
              : 'cursor-not-allowed bg-white/5 text-white/30',
          )}
        >
          ⚡ {t('generate', locale)} — {creditCost} {t('credits', locale)}
        </motion.button>
      </div>
    </motion.div>
  );
}
