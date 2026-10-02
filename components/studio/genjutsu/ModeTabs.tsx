'use client';

/**
 * ModeTabs — the two-or-three-way segmented control under the hero (Higgsfield's „References | Extend Video"): Scene ·
 * Motion · Swap. A real radio group (one Tab stop, arrows move the choice), 44 px tall.
 *
 * A LOCKED mode is still selectable on purpose: the user opens it to see what it will do, and the panel then says —
 * plainly, on that screen — that it is not open yet and that nothing is charged. The lock glyph on the segment says so
 * before the tap. `open[op] === null` means the capabilities answer has not arrived yet (no lock shown, no promise made).
 */
import { Clapperboard, Lock, PersonStanding, Repeat, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';
import { GENJUTSU_OPS, type GenjutsuOp } from '@/lib/genjutsu/types';
import { copyFor } from './copy';

const ICON: Record<GenjutsuOp, LucideIcon> = { scene: Clapperboard, motion: PersonStanding, swap: Repeat };

export interface ModeTabsProps {
  locale: string;
  value: GenjutsuOp;
  onChange: (op: GenjutsuOp) => void;
  open: Record<GenjutsuOp, boolean | null>;
}

export function ModeTabs({ locale, value, onChange, open }: ModeTabsProps) {
  const c = copyFor(locale);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checked = GENJUTSU_OPS.indexOf(value);
  const go = (i: number) => {
    const op = GENJUTSU_OPS[(i + GENJUTSU_OPS.length) % GENJUTSU_OPS.length]!;
    onChange(op);
    refs.current[GENJUTSU_OPS.indexOf(op)]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
  };
  return (
    <div role="radiogroup" aria-label={c.heroEyebrow} data-testid="vfx-modes" className="grid grid-cols-3 gap-1 rounded-2xl bg-app-elevated/60 p-1 ring-1 ring-app-border/10">
      {GENJUTSU_OPS.map((op, i) => {
        const on = i === checked;
        const Icon = ICON[op];
        const locked = open[op] === false;
        return (
          <button
            key={op}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-mode={op}
            data-locked={locked ? 'true' : undefined}
            onClick={() => onChange(op)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex min-h-[44px] min-w-0 items-center justify-center gap-1.5 rounded-xl px-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/70 ${on ? 'bg-app-surface text-app-text shadow-sm ring-1 ring-app-border/15' : 'text-app-muted hover:text-app-text'}`}
          >
            <Icon size={15} aria-hidden="true" className="shrink-0" />
            <span className="truncate">{c.mode[op]}</span>
            {locked && <Lock size={11} aria-hidden="true" className="shrink-0 opacity-70" />}
          </button>
        );
      })}
    </div>
  );
}
