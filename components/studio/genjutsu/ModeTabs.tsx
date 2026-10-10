'use client';

/**
 * ModeTabs — the segmented control under the hero (Higgsfield's „References | Extend Video"): Scene · Motion · Swap,
 * but only the modes the panel OFFERS (`ops`). A real radio group (one Tab stop, arrows move the choice), 44 px tall.
 *
 * A mode that is not open is not offered (the owner, 2026-10-09: „remove everything superfluous"): Motion and Swap
 * also have their own tools (Motion transfer, Character swap), so two locked „soon" tabs here only repeated them. The
 * panel renders no tab bar at all while Scene is the only mode. A mode that closes WHILE it is picked (a 423 from the
 * quote) stays in `ops` so the user can read why and switch back; its lock glyph says so.
 */
import { Clapperboard, Lock, PersonStanding, Repeat, type LucideIcon } from 'lucide-react';
import { useRef } from 'react';
import type { GenjutsuOp } from '@/lib/genjutsu/types';
import { copyFor } from './copy';

const ICON: Record<GenjutsuOp, LucideIcon> = { scene: Clapperboard, motion: PersonStanding, swap: Repeat };

export interface ModeTabsProps {
  locale: string;
  value: GenjutsuOp;
  onChange: (op: GenjutsuOp) => void;
  open: Record<GenjutsuOp, boolean | null>;
  /** The modes offered, in GENJUTSU_OPS order. */
  ops: readonly GenjutsuOp[];
}

const COLS: Record<number, string> = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

export function ModeTabs({ locale, value, onChange, open, ops }: ModeTabsProps) {
  const c = copyFor(locale);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const checked = ops.indexOf(value);
  const go = (i: number) => {
    const op = ops[(i + ops.length) % ops.length]!;
    onChange(op);
    refs.current[ops.indexOf(op)]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); go(i + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); go(i - 1); }
  };
  return (
    <div role="radiogroup" aria-label={c.heroEyebrow} data-testid="vfx-modes" className={`grid ${COLS[ops.length] ?? 'grid-cols-3'} gap-1 rounded-2xl bg-app-elevated/60 p-1 ring-1 ring-app-border/10`}>
      {ops.map((op, i) => {
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
