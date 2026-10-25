'use client';

/**
 * ServiceQuickSettings — the active service's few settings that matter most, as one row of compact chips inside the chat
 * box: `ფილმი ▾ · 9:16 ▾ · 8 წმ ▾ · Veo 3.1 Fast ▾ · ⋯` (GG's unified-composer task, 2026-10-25).
 *
 * A VIEW. Every chip shows a value OmniStudio already holds and opens the picker that already sets it; nothing here keeps
 * state, prices or sends. The row never wraps: on a 375 px phone it scrolls sideways, so a service with many settings never
 * grows the composer over the conversation. `⋯` opens the service's full settings (ServiceAdvancedSettings — the existing
 * panel, anchored to the composer).
 *
 * Every chip is a ≥ 44 px target, names itself („ფორმატი: 9:16") and reports aria-expanded while its picker is open.
 */

import { forwardRef, type ReactNode, type Ref } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';

export interface QuickChip {
  id: string;
  icon?: ReactNode;
  /** The visible value („9:16", „8 წმ"). */
  value: string;
  /** What the chip is („ფორმატი") — the accessible name is `${label}: ${value}`. */
  label: string;
  onOpen: () => void;
  expanded?: boolean;
  /** The chip's element, for a picker that anchors to it (OptionPicker on a desktop). */
  chipRef?: Ref<HTMLButtonElement>;
  /** A switch chip (Instrumental) shows no chevron and reports aria-pressed instead. */
  pressed?: boolean;
  /** Locked by what the server runs today (a sung song before vocals are verified): shown, not pressable. */
  disabled?: boolean;
  /** Why it is locked — the tooltip and the accessible description. */
  note?: string;
}

const CHIP = 'inline-flex h-11 shrink-0 touch-manipulation items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium tabular-nums text-app-text ring-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/60 disabled:cursor-not-allowed disabled:opacity-50';

const Chip = forwardRef<HTMLButtonElement, { chip: QuickChip }>(function Chip({ chip }, ref) {
  const toggle = chip.pressed !== undefined;
  return (
    <button
      ref={ref}
      type="button"
      onClick={chip.onOpen}
      disabled={chip.disabled}
      data-testid={`quick-${chip.id}`}
      aria-label={`${chip.label}: ${chip.value}`}
      title={chip.note ?? chip.label}
      {...(chip.note ? { 'aria-description': chip.note } : {})}
      {...(toggle ? { 'aria-pressed': chip.pressed } : { 'aria-haspopup': 'dialog' as const, 'aria-expanded': chip.expanded ?? false })}
      className={`${CHIP} ${toggle && chip.pressed ? 'bg-app-accent/15 text-app-accent ring-app-accent/35' : 'bg-app-surface/60 ring-app-border/15 hover:bg-app-surface'}`}
    >
      {chip.icon ? <span aria-hidden="true" className="flex shrink-0 text-app-muted">{chip.icon}</span> : null}
      <span>{chip.value}</span>
      {toggle ? null : <ChevronDown size={13} aria-hidden="true" className="shrink-0 opacity-60" />}
    </button>
  );
});

export function ServiceQuickSettings({ chips, onMore, moreExpanded, moreLabel, testId = 'service-quick-settings', moreTestId = 'quick-more' }: {
  chips: readonly QuickChip[];
  /** Omit when the service has nothing beyond its chips. */
  onMore?: () => void;
  moreExpanded?: boolean;
  moreLabel: string;
  testId?: string;
  /** The studio's specs open the settings by `options-toggle`, the id ⚙ carried before this row took its place. */
  moreTestId?: string;
}) {
  if (chips.length === 0 && !onMore) return null;
  return (
    <div data-testid={testId} role="group" aria-label={moreLabel}
      className="-mx-1 flex min-w-0 items-center gap-1.5 overflow-x-auto overscroll-x-contain px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {chips.map((c) => <Chip key={c.id} chip={c} ref={c.chipRef} />)}
      {onMore && (
        <button type="button" onClick={onMore} data-testid={moreTestId} aria-haspopup="dialog" aria-expanded={moreExpanded ?? false}
          aria-label={moreLabel} title={moreLabel}
          className={`${CHIP} bg-app-surface/60 ring-app-border/15 hover:bg-app-surface`}>
          <MoreHorizontal size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{moreLabel}</span>
        </button>
      )}
    </div>
  );
}
