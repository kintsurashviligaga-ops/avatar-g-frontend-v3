'use client';

/**
 * PickerQuickChips — a ServiceQuickSettings row whose every chip opens one OptionPicker: the shape of a service whose quick
 * settings are plain lists (Product ad: format · length · style; Interior: room · style). A VIEW over the caller's state, as
 * ServiceQuickSettings is: it holds only which picker is open.
 */
import { createRef, useMemo, useState, type ReactNode, type RefObject } from 'react';
import { OptionPicker, type PickerOption } from '@/components/studio/create/OptionPicker';
import { ServiceQuickSettings, type QuickChip } from './ServiceQuickSettings';

export interface PickerChipSpec<T extends string | number = string | number> {
  id: string;
  icon?: ReactNode;
  label: string;
  value: T;
  /** The chip's visible value; defaults to the selected option's label. */
  valueLabel?: string;
  options: readonly PickerOption<T>[];
  onSelect: (v: T) => void;
  columns?: 1 | 3 | 5;
}

export function PickerQuickChips({ specs, desktop, closeLabel, onMore, moreExpanded, moreLabel, testId }: {
  specs: readonly PickerChipSpec[];
  desktop: boolean;
  closeLabel: string;
  onMore?: () => void;
  moreExpanded?: boolean;
  moreLabel: string;
  testId: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const ids = specs.map((s) => s.id).join('|');
  // One stable ref per chip, for the desktop popover's anchor.
  const refs = useMemo(() => Object.fromEntries(ids.split('|').map((id) => [id, createRef<HTMLButtonElement>()])) as Record<string, RefObject<HTMLButtonElement>>, [ids]);
  const chips: QuickChip[] = specs.map((s) => ({
    id: s.id, icon: s.icon, label: s.label,
    value: s.valueLabel ?? s.options.find((o) => o.value === s.value)?.label ?? String(s.value),
    onOpen: () => setOpen((cur) => (cur === s.id ? null : s.id)), expanded: open === s.id, chipRef: refs[s.id],
  }));
  return (
    <>
      <ServiceQuickSettings chips={chips} onMore={onMore} moreExpanded={moreExpanded} moreLabel={moreLabel} testId={testId} moreTestId="options-toggle" />
      {specs.map((s) => (
        <OptionPicker key={s.id} open={open === s.id} onClose={() => setOpen(null)} title={s.label} closeLabel={closeLabel}
          options={s.options} value={s.value} onSelect={s.onSelect} desktop={desktop} anchorRef={refs[s.id] ?? createRef<HTMLButtonElement>()} columns={s.columns}
          testId={`quick-picker-${s.id}`} />
      ))}
    </>
  );
}
