'use client';

import { Check, Paperclip, type LucideIcon } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

/**
 * What the composer's „+" opens — the Gemini grammar (docs/DESIGN.md §8): ONE button for what you bring, then the
 * tools, each a line icon, a name and one line of what it does. Choosing a tool closes the sheet and puts it in the
 * composer as a chip.
 *
 * ⚠️ ONE ATTACH BUTTON, NOT FOUR TILES. Photos, Video, Camera and Files were four tiles for one job, and the owner
 * asked for the customary single button. The phone's own picker already offers the photo library, the camera and the
 * files from one tap (an <input type="file"> does that on iOS and Android), so a single „Attach" covers all of them;
 * the line under it says what the open tool takes.
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

const COPY: Record<Lang, { title: string; close: string; attach: string; attachAll: string; tools: string; more: string }> = {
  ka: { title: 'დამატება და ხელსაწყოები', close: 'დახურვა', attach: 'ფაილის მიმაგრება', attachAll: 'ფოტო, ვიდეო, კამერა, დოკუმენტი, აუდიო', tools: 'ხელსაწყოები', more: 'მეტი' },
  en: { title: 'Add and tools', close: 'Close', attach: 'Attach files', attachAll: 'Photos, videos, camera, documents, audio', tools: 'Tools', more: 'More' },
  ru: { title: 'Добавить и инструменты', close: 'Закрыть', attach: 'Прикрепить файлы', attachAll: 'Фото, видео, камера, документы, аудио', tools: 'Инструменты', more: 'Ещё' },
};

export function ToolSheet({
  open, onClose, locale, title, tools, studios = [], extras = [], activeId, onTool, onAttach, attachHint,
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
  /**
   * The one attach button: opens the picker for whatever the active tool takes (the chat: anything readable — photos,
   * video, the camera, documents, audio). Absent = the tool takes no files (a studio), and no button is drawn.
   */
  onAttach?: () => void;
  /** The line under the button: what this tool takes. Default: everything the chat reads. */
  attachHint?: string;
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
    <BottomSheet open={open} onClose={onClose} closeLabel={c.close} testId="tool-sheet" title={title ?? c.title} showHeader={false}>
      {onAttach && (
        <div className="px-1 pb-3 pt-1">
          <button type="button" data-testid="attach" onClick={() => { onAttach(); onClose(); }}
            className="flex min-h-[64px] w-full items-center gap-3.5 rounded-2xl bg-app-elevated/70 px-3 text-left transition-colors hover:bg-app-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent">
            <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-accent/15 text-app-accent">
              <Paperclip size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold leading-tight text-app-text">{c.attach}</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-app-muted">{attachHint ?? c.attachAll}</span>
            </span>
          </button>
        </div>
      )}
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
