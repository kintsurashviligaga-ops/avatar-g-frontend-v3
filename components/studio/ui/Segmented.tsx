'use client';

import { useRef } from 'react';

/**
 * A real radio group for a handful of mutually exclusive values (a video's format, its length) — the ARIA radio
 * pattern, not buttons wearing radio roles: ONE Tab stop per group (the checked radio, or the first enabled one when
 * none is), arrows move the choice and the focus together, Home/End jump to the ends. A screen reader announces
 * "radio, 1 of 4" and the keys behave like it.
 */
export function Segmented<T extends string | number>({
  label, options, value, onChange, cols, isDisabled, format = (v) => String(v),
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  /** Tailwind grid-cols class, e.g. `grid-cols-4`. */
  cols: string;
  isDisabled?: (v: T) => boolean;
  format?: (v: T) => string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = (i: number) => !isDisabled?.(options[i] as T);
  const checkedAt = options.findIndex((o) => o === value);
  const tabAt = checkedAt >= 0 && enabled(checkedAt) ? checkedAt : options.findIndex((_, i) => enabled(i));
  const pick = (i: number) => {
    const v = options[i] as T;
    onChange(v);
    refs.current[i]?.focus();
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= options.length; k++) {
      const i = (from + dir * k + options.length) % options.length;
      if (enabled(i)) return pick(i);
    }
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); step(i, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); step(i, -1); }
    else if (e.key === 'Home') { e.preventDefault(); step(-1, 1); }
    else if (e.key === 'End') { e.preventDefault(); step(options.length, -1); }
  };
  return (
    <div role="radiogroup" aria-label={label}>
      <span aria-hidden="true" className="mb-1.5 block text-[12px] font-medium text-app-muted">{label}</span>
      <div className={`grid gap-1.5 ${cols}`}>
        {options.map((o, i) => {
          const on = i === checkedAt;
          return (
            <button key={String(o)} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on}
              tabIndex={i === tabAt ? 0 : -1} disabled={!enabled(i)} onClick={() => onChange(o)} onKeyDown={(e) => onKeyDown(e, i)}
              className={`min-h-[44px] rounded-xl border text-[13px] font-medium tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${on ? 'border-app-accent/60 bg-app-accent/15 text-app-accent' : 'border-app-border/20 bg-app-bg/40 text-app-text hover:bg-app-elevated'}`}>
              {format(o)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
