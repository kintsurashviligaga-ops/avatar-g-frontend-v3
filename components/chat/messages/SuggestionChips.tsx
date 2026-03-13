'use client';

/**
 * components/chat/messages/SuggestionChips.tsx
 * =============================================
 * Horizontal row of contextual suggestion chips.
 */

import type { SuggestionChip } from '@/lib/chat/types';

interface Props {
  chips: SuggestionChip[];
  onSelect: (action: string) => void;
}

export function SuggestionChips({ chips, onSelect }: Props) {
  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-1.5 px-1 mt-2">
      {chips.map((chip, i) => (
        <button
          key={`${chip.label}-${i}`}
          onClick={() => onSelect(chip.action)}
          className="inline-flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-full transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{
            backgroundColor: chip.variant === 'primary' ? 'var(--color-accent-soft)' : 'var(--color-surface)',
            color: chip.variant === 'primary' ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            border: `1px solid ${chip.variant === 'primary' ? 'var(--color-accent)' : 'var(--color-border)'}`,
          }}
        >
          {chip.icon && <span>{chip.icon}</span>}
          {chip.label}
        </button>
      ))}
    </div>
  );
}
