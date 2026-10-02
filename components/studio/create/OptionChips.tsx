'use client';

/**
 * The chip row of a Create screen — Higgsfield's [▢ 1:1] [◇ 2K] [⧉ 1]: each chip shows the CURRENT value with a small
 * icon, and opens a picker for it (components/studio/create/OptionPicker). 48 px tall, rounded-full, wraps instead of
 * overflowing (Georgian values run long and a phone is 375 px).
 */
import { forwardRef, type ReactNode } from 'react';

export const OptionChip = forwardRef<HTMLButtonElement, {
  icon: ReactNode;
  /** The visible value ("1:1", "2K", "×2"). */
  children: ReactNode;
  /** The accessible name — what the chip IS and its value ("Aspect ratio: 1:1"). */
  label: string;
  expanded?: boolean;
  onClick: () => void;
  testId?: string;
}>(function OptionChip({ icon, children, label, expanded, onClick, testId }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={expanded ?? false}
      data-testid={testId}
      className="inline-flex h-12 min-w-0 touch-manipulation items-center gap-2 rounded-full bg-app-elevated px-4 text-[15px] font-semibold tabular-nums text-app-text ring-1 ring-app-border/10 transition-[background-color,transform] hover:bg-app-elevated/80 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60"
    >
      <span className="flex shrink-0 items-center text-app-muted" aria-hidden="true">{icon}</span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
});

/** The row: wraps, never scrolls sideways. */
export function OptionChipRow({ children, label }: { children: ReactNode; label?: string }) {
  return <div role="group" aria-label={label} className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>;
}
