'use client';

/**
 * components/chat/messages/ClarificationCardView.tsx
 * ====================================================
 * Shows a clarification prompt with option buttons.
 */

interface ClarificationOption {
  label: string;
  value: string;
  icon?: string;
}

interface Props {
  question: string;
  options: ClarificationOption[];
  onSelect: (value: string) => void;
}

export function ClarificationCardView({ question, options, onSelect }: Props) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      <p className="text-sm font-medium mb-3" style={{ color: 'var(--color-text)' }}>
        ❓ {question}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{
              backgroundColor: 'rgba(34,211,238,0.08)',
              color: 'var(--color-accent)',
              border: '1px solid rgba(34,211,238,0.2)',
            }}
          >
            {opt.icon && <span>{opt.icon}</span>}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
