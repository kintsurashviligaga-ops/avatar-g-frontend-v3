'use client';

/**
 * OptionPicker — the one-of-N chooser behind every chip of a Create screen (aspect · quality · count · model).
 *
 *   · PHONE  → the studio's BottomSheet (components/studio/ui/BottomSheet): rises from the bottom edge, a real dialog
 *              (focus in, Tab trapped, Escape and the backdrop close it) — the sheet this opens FROM is a dialog too, and
 *              useDialogA11y keeps Escape to the top-most one.
 *   · DESKTOP → a popover anchored to the chip that opened it: portaled to <body> with fixed coordinates (the settings column
 *              scrolls and clips, an absolutely positioned child would be cut off), flips upward when the chip sits low
 *              (the Generate footer does), closes on outside press, Escape, resize and any scroll outside itself.
 *
 * Both draw the same options: a radio group (ONE Tab stop, arrows move the choice, Home/End jump) of ≥ 44 px targets, a
 * glyph slot (the aspect picker draws the ratio), a hint line and a trailing price. Picking closes the picker — a single
 * choice has nothing left to do.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { BottomSheet } from '@/components/studio/ui/BottomSheet';

export interface PickerOption<T extends string | number> {
  value: T;
  label: string;
  /** One line under the label — what the choice means. */
  hint?: string;
  /** A drawn glyph on the left (the aspect picker's ratio shape). */
  glyph?: ReactNode;
  /** Right-aligned, tabular: a price. */
  trailing?: string;
  disabled?: boolean;
}

interface PickerProps<T extends string | number> {
  open: boolean;
  onClose: () => void;
  /** The picker's name — its heading on a phone and its accessible name everywhere. */
  title: string;
  closeLabel: string;
  options: readonly PickerOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  /** ≥ 1024 px: a popover next to `anchorRef`; otherwise the bottom sheet. */
  desktop: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  /** 1 = a list of rows; 3 or 5 = a grid of tiles (the aspect picker). */
  columns?: 1 | 3 | 5;
  /** A note under the options (what "Auto" uses). */
  footer?: ReactNode;
  testId?: string;
}

const GRID: Record<1 | 3 | 5, string> = { 1: 'space-y-1', 3: 'grid grid-cols-3 gap-2', 5: 'grid grid-cols-5 gap-2' };

function PickerList<T extends string | number>({
  options, value, onSelect, columns, label, focusSelected,
}: Pick<PickerProps<T>, 'options' | 'value' | 'onSelect'> & { columns: 1 | 3 | 5; label: string; focusSelected: boolean }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = (i: number) => !options[i]?.disabled;
  const checkedAt = options.findIndex((o) => o.value === value);
  const tabAt = checkedAt >= 0 && enabled(checkedAt) ? checkedAt : options.findIndex((_, i) => enabled(i));
  // A popover is not a dialog, so nothing moves focus into it: put it on the current choice.
  useEffect(() => { if (focusSelected) refs.current[tabAt]?.focus({ preventScroll: true }); }, [focusSelected, tabAt]);
  const move = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= options.length; k++) {
      const i = (from + dir * k + options.length) % options.length;
      if (enabled(i)) { refs.current[i]?.focus(); return; }
    }
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(i, 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(i, -1); }
    else if (e.key === 'Home') { e.preventDefault(); move(-1, 1); }
    else if (e.key === 'End') { e.preventDefault(); move(options.length, -1); }
  };
  const grid = columns > 1;
  return (
    <div role="radiogroup" aria-label={label} className={GRID[columns]}>
      {options.map((o, i) => {
        const on = i === checkedAt;
        return (
          <button
            key={String(o.value)}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={i === tabAt ? 0 : -1}
            disabled={o.disabled}
            data-value={String(o.value)}
            onClick={() => onSelect(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`touch-manipulation rounded-2xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:cursor-not-allowed disabled:opacity-40 ${
              grid
                ? 'flex min-h-[68px] flex-col items-center justify-center gap-1.5 px-1 py-2 text-center'
                : 'flex min-h-[56px] w-full items-center gap-3 px-3 py-2'
            } ${on ? 'bg-app-accent/15 text-app-accent ring-1 ring-app-accent/40' : 'bg-app-elevated/60 text-app-text ring-1 ring-app-border/10 hover:bg-app-elevated'}`}
          >
            {o.glyph != null && <span className={`flex shrink-0 items-center justify-center ${grid ? 'h-8 w-8' : 'h-10 w-10'}`} aria-hidden="true">{o.glyph}</span>}
            <span className={`min-w-0 ${grid ? '' : 'flex-1'}`}>
              <span className={`block font-medium leading-tight ${grid ? 'text-[12.5px]' : 'text-[15px]'}`}>{o.label}</span>
              {o.hint && !grid && <span className="mt-0.5 block text-[12.5px] leading-snug text-app-muted">{o.hint}</span>}
            </span>
            {o.trailing && !grid && <span className="shrink-0 text-[13px] font-medium tabular-nums text-app-muted">{o.trailing}</span>}
            {on && !grid && <Check size={16} aria-hidden="true" className="shrink-0 text-app-accent" />}
          </button>
        );
      })}
    </div>
  );
}

interface Pos { top?: number; bottom?: number; left: number; width: number; maxHeight: number }

function Popover({
  anchorRef, onClose, label, wide, children,
}: { anchorRef: RefObject<HTMLElement | null>; onClose: () => void; label: string; wide: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const close = useCallback(() => { onClose(); anchorRef.current?.focus({ preventScroll: true }); }, [onClose, anchorRef]);

  useLayoutEffect(() => {
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(wide ? 340 : 300, vw - 16);
    // Left-aligned with the chip; when that would run off the right edge, right-aligned with it instead.
    const left = r.left + width > vw - 8 ? Math.max(8, r.right - width) : r.left;
    const below = vh - r.bottom - 12;
    const above = r.top - 12;
    const up = below < 280 && above > below;
    const maxHeight = Math.max(160, Math.min(460, up ? above : below));
    setPos(up ? { bottom: vh - r.top + 6, left, width, maxHeight } : { top: r.bottom + 6, left, width, maxHeight });
  }, [anchorRef, wide]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || ref.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    const onScroll = (e: Event) => { if (e.target instanceof Node && ref.current?.contains(e.target)) return; onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [anchorRef, onClose, close]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={label}
      data-testid="picker-popover"
      style={pos ? { position: 'fixed', zIndex: 96, ...pos } : { position: 'fixed', zIndex: 96, visibility: 'hidden', left: 0, top: 0, width: wide ? 340 : 300 }}
      className="overflow-y-auto overscroll-contain rounded-3xl border border-app-border/10 bg-app-surface p-2 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
    >
      {children}
    </div>,
    document.body,
  );
}

export function OptionPicker<T extends string | number>({
  open, onClose, title, closeLabel, options, value, onSelect, desktop, anchorRef, columns = 1, footer, testId,
}: PickerProps<T>) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!open || !mounted) return null;
  const choose = (v: T) => { onSelect(v); onClose(); if (desktop) anchorRef.current?.focus({ preventScroll: true }); };
  const list = <PickerList options={options} value={value} onSelect={choose} columns={columns} label={title} focusSelected={desktop} />;
  const note = footer ? <div className="px-2 pb-1 pt-2.5 text-[12.5px] leading-snug text-app-muted">{footer}</div> : null;
  if (desktop) {
    return <Popover anchorRef={anchorRef} onClose={onClose} label={title} wide={columns > 1}>{list}{note}</Popover>;
  }
  return (
    <BottomSheet open onClose={onClose} title={title} closeLabel={closeLabel} testId={testId ?? 'picker-sheet'}>
      <div className="px-1 pb-2">{list}{note}</div>
    </BottomSheet>
  );
}
