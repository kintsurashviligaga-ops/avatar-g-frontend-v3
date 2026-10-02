'use client';

/**
 * PillSegmented — a handful of mutually exclusive stops as one rounded pill (ref2's "Male | Female"; ours has four).
 * The ARIA radio pattern, like components/studio/ui/Segmented: ONE Tab stop (the checked radio), arrows move the choice and
 * the focus together, Home/End jump to the ends, disabled stops are skipped. Every stop is 44 px tall.
 */
import { useRef, type ReactNode } from 'react';
import { cx } from './primitives';

export function PillSegmented<T extends string>({
  label, options, value, onChange, disabled = false, testId,
}: {
  label: string;
  options: ReadonlyArray<{ id: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  /** The whole control is moot (a vocal gender on an instrumental): shown, `aria-disabled`, and nothing changes. */
  disabled?: boolean;
  testId?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checked = Math.max(0, options.findIndex((o) => o.id === value));
  const pick = (i: number) => {
    const o = options[i];
    if (!o || disabled) return;
    onChange(o.id);
    refs.current[i]?.focus();
  };
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const n = options.length;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick((i + 1) % n); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick((i - 1 + n) % n); }
    else if (e.key === 'Home') { e.preventDefault(); pick(0); }
    else if (e.key === 'End') { e.preventDefault(); pick(n - 1); }
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-testid={testId}
      className={cx('inline-flex min-w-0 max-w-full rounded-full bg-app-bg/50 p-0.5 ring-1 ring-app-border/10', disabled && 'opacity-50')}
    >
      {options.map((o, i) => {
        const on = i === checked;
        return (
          <button
            key={o.id}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === checked ? 0 : -1}
            data-testid={testId ? `${testId}-${o.id}` : undefined}
            onClick={disabled ? undefined : () => onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'min-h-[44px] min-w-0 touch-manipulation rounded-full px-3 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60',
              on ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40' : 'text-app-muted hover:text-app-text',
              disabled && 'cursor-not-allowed',
            )}
          >
            <span className="block truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
