'use client';

/**
 * StyleChips — pick up to `max` styles for one track (owner plan 2b: the music panel's single genre became a blend of
 * up to three, sent as `styles[]` and read by the engines as one line, "georgian folk, jazz").
 *
 * The order picked is the order sent, so the first pick leads. The last style cannot be removed — an engine needs one —
 * and at the cap the unpicked chips are DISABLED rather than silently dropping an earlier pick (lib/ai/musicControls
 * `toggleStyle`); the counter beside the label says why. The strip scrolls sideways inside itself, as the single-select
 * strip did: `min-w-0` plus its own `overflow-x-auto` keep 19 chips from ever widening a 375px page.
 */
import type { ReactNode } from 'react';
import { MAX_STYLES, toggleStyle } from '@/lib/ai/musicControls';
import { Chip } from './controls';

export function StyleChips({
  label, options, value, onChange, max = MAX_STYLES, testId,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; label: ReactNode }>;
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  testId?: string;
}) {
  const full = value.length >= max;
  return (
    <div className="min-w-0" data-testid={testId}>
      <div className="mb-1.5 flex min-w-0 items-baseline justify-between gap-2">
        <span className="min-w-0 text-[12.5px] font-semibold text-app-text">{label}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-app-muted" aria-live="polite">{value.length}/{max}</span>
      </div>
      <div role="group" aria-label={label} className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <Chip
              key={o.id}
              active={on}
              disabled={!on && full}
              onClick={() => {
                const next = toggleStyle(value, o.id, max);
                if (next !== value) onChange(next);
              }}
            >
              {o.label}
            </Chip>
          );
        })}
      </div>
    </div>
  );
}
