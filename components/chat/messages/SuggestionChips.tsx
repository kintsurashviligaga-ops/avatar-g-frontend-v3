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
          className={`chat-suggestion ${chip.variant === 'primary' ? 'primary' : 'secondary'}`}
        >
          {chip.icon && <span>{chip.icon}</span>}
          {chip.label}
        </button>
      ))}
    </div>
  );
}
