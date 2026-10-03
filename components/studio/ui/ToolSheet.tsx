'use client';

import { Check, type LucideIcon } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

/**
 * What the composer's „+" opens — the tools (docs/DESIGN.md §8), each a line icon, a name and one line of what it does.
 * Choosing a tool closes the sheet and puts it in the composer as a chip.
 *
 * ⚠️ FILES ARE NOT HERE ANY MORE. The one attach button lived at the top of this sheet, two taps from the composer, and
 * the owner asked for it beside „+" where people look for it (2026-10-03): it is the composer's paperclip now
 * (OmniStudio, `data-testid="composer-attach"`), drawn only for a tool that takes files.
 */
export interface ToolEntry {
  id: string;
  Icon: LucideIcon;
  title: string;
  sub: string;
  disabled?: boolean;
  /** A short muted tag, e.g. "მალე" for a tool that is not live yet. */
  tag?: string;
}

type Lang = 'ka' | 'en' | 'ru';

const COPY: Record<Lang, { close: string; tools: string; more: string }> = {
  ka: { close: 'დახურვა', tools: 'ხელსაწყოები', more: 'მეტი' },
  en: { close: 'Close', tools: 'Tools', more: 'More' },
  ru: { close: 'Закрыть', tools: 'Инструменты', more: 'Ещё' },
};

export function ToolSheet({
  open, onClose, locale, title, tools, studios = [], extras = [], activeId, onTool,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
  /** Overrides the sheet's accessible name — e.g. „აირჩიე ხელსაწყო" when it is opened to switch tools only. */
  title?: string;
  /** The primary tools, in order (video first). */
  tools: ToolEntry[];
  /** The tools one level down: video variants, motion, and the full studios (montage, dubbing, 3D, presentation). */
  studios?: ToolEntry[];
  /** Rows that DO something instead of switching the active tool (Deep Research, Connectors). Empty = nothing is drawn. */
  extras?: Array<ToolEntry & { onPick: () => void }>;
  activeId: string | null;
  onTool: (id: string) => void;
}) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const c = COPY[lang];
  const row = (t: ToolEntry) => {
    const on = activeId === t.id;
    return (
      <li key={t.id}>
        <button type="button" disabled={t.disabled} aria-pressed={on} onClick={() => { onTool(t.id); onClose(); }}
          className={`flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${on ? 'bg-app-elevated' : 'hover:bg-app-elevated/70'}`}>
          <t.Icon size={20} aria-hidden="true" className={`shrink-0 ${on ? 'text-app-accent' : 'text-app-text/80'}`} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium leading-tight text-app-text">{t.title}</span>
            <span className="mt-0.5 block truncate text-[12.5px] leading-tight text-app-muted">{t.sub}</span>
          </span>
          {t.tag ? <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-app-muted">{t.tag}</span> : null}
          {on ? <Check size={16} aria-hidden="true" className="shrink-0 text-app-accent" /> : null}
        </button>
      </li>
    );
  };
  return (
    <BottomSheet open={open} onClose={onClose} closeLabel={c.close} testId="tool-sheet" title={title ?? c.tools} showHeader={false}>
      <p className="px-3 pb-1 pt-1 text-[12px] font-medium text-app-muted">{c.tools}</p>
      <ul className="space-y-0.5" aria-label={c.tools}>{tools.map(row)}</ul>
      {extras.length > 0 && (
        <ul className="mt-0.5 space-y-0.5" aria-label={c.tools} data-testid="tool-sheet-extras">
          {extras.map((t) => (
            <li key={t.id}>
              <button type="button" data-testid={`tool-extra-${t.id}`} onClick={() => { t.onPick(); onClose(); }}
                className="flex min-h-[56px] w-full items-center gap-3.5 rounded-2xl px-3 text-left transition-colors hover:bg-app-elevated/70">
                <t.Icon size={20} aria-hidden="true" className="shrink-0 text-app-text/80" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-tight text-app-text">{t.title}</span>
                  <span className="mt-0.5 block truncate text-[12.5px] leading-tight text-app-muted">{t.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {studios.length > 0 && (
        <>
          <p className="px-3 pb-1 pt-3 text-[12px] font-medium text-app-muted">{c.more}</p>
          <ul className="space-y-0.5" aria-label={c.more}>{studios.map(row)}</ul>
        </>
      )}
    </BottomSheet>
  );
}
