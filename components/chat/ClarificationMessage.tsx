'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { ClarificationQuestion, ChipOption } from '@/lib/agent-g-clarifier';
import { localizeLabel } from '@/lib/agent-g-clarifier';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ClarificationMessageProps {
  question: ClarificationQuestion;
  stepNumber: number;
  totalSteps: number;
  locale?: string;
  onAnswer: (questionId: string, value: string | string[]) => void;
  disabled?: boolean;
  selectedValue?: string | string[];
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

function Chip({
  option,
  selected,
  onClick,
  disabled,
  locale,
}: {
  option: ChipOption;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  locale: string;
}) {
  const label = localizeLabel(option.label, locale);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: disabled ? 1 : 0.95 }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
        selected
          ? 'border-cyan-400/60 bg-cyan-400/20 text-cyan-200 shadow-[0_0_8px_rgba(34,211,238,0.3)]'
          : 'border-white/15 bg-white/[0.04] text-white/70 hover:border-cyan-400/40 hover:bg-white/[0.08] hover:text-white/90',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {option.icon && <span className="text-sm leading-none">{option.icon}</span>}
      <span>{label}</span>
      {option.credits !== undefined && (
        <span className={cn('ml-1 text-[10px]', selected ? 'text-cyan-300' : 'text-white/40')}>
          {option.credits}kr
        </span>
      )}
    </motion.button>
  );
}

// ─── Multi-select chips ───────────────────────────────────────────────────────

function MultiChips({
  options,
  selected,
  onChange,
  disabled,
  locale,
}: {
  options: ChipOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  locale: string;
}) {
  const toggle = (value: string) => {
    if (disabled) return;
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <Chip
          key={opt.value}
          option={opt}
          selected={selected.includes(opt.value)}
          onClick={() => toggle(opt.value)}
          disabled={disabled}
          locale={locale}
        />
      ))}
      {selected.length > 0 && !disabled && (
        <motion.button
          type="button"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-400/20"
          onClick={() => onChange(selected)}
        >
          ✓ OK ({selected.length})
        </motion.button>
      )}
    </div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 rounded-full transition-all',
            i + 1 < current ? 'w-3 bg-cyan-400' :
            i + 1 === current ? 'w-4 bg-cyan-300' :
            'w-1.5 bg-white/20',
          )}
        />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ClarificationMessage({
  question,
  stepNumber,
  totalSteps,
  locale = 'ka',
  onAnswer,
  disabled = false,
  selectedValue,
}: ClarificationMessageProps) {
  const [multiSelected, setMultiSelected] = useState<string[]>(
    Array.isArray(selectedValue) ? selectedValue : [],
  );

  const questionText = localizeLabel(question.text, locale);

  const stepLabel = locale === 'ka'
    ? `ნაბიჯი ${stepNumber}/${totalSteps}`
    : locale === 'ru'
      ? `Шаг ${stepNumber}/${totalSteps}`
      : `Step ${stepNumber}/${totalSteps}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-400/20 text-[10px] font-bold text-cyan-300">
            G
          </span>
          <span className="text-xs font-semibold text-white/60">Agent G</span>
        </div>
        <div className="flex items-center gap-2">
          <StepDots current={stepNumber} total={totalSteps} />
          <span className="text-[10px] text-white/40">{stepLabel}</span>
        </div>
      </div>

      {/* Question */}
      <p className="mb-3 text-sm font-medium text-white/90">{questionText}</p>

      {/* Chips */}
      {question.type === 'multi' ? (
        <MultiChips
          options={question.options}
          selected={multiSelected}
          onChange={(vals) => {
            setMultiSelected(vals);
            onAnswer(question.id, vals);
          }}
          disabled={disabled}
          locale={locale}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {question.options.map(opt => (
            <Chip
              key={opt.value}
              option={opt}
              selected={
                typeof selectedValue === 'string'
                  ? selectedValue === opt.value
                  : false
              }
              onClick={() => onAnswer(question.id, opt.value)}
              disabled={disabled}
              locale={locale}
            />
          ))}
        </div>
      )}
    </motion.div>
  );
}
