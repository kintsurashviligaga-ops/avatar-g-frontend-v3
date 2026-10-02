'use client';

import { Camera, Check, Image as ImageIcon, Paperclip, Video, type LucideIcon } from 'lucide-react';
import { BottomSheet } from './BottomSheet';

/**
 * What the composer's „+" opens — the Gemini grammar (docs/DESIGN.md §8): large tiles for what you bring
 * (photos, video, camera, files), then the tools, each a line icon, a name and one line of what it does. Choosing a
 * tool closes the sheet and puts it in the composer as a chip. One entry point replaces what used to be four
 * controls in the composer row (+, camera, the mode dropdown and the options toggle).
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

const COPY: Record<Lang, { title: string; close: string; photos: string; video: string; camera: string; files: string; tools: string; more: string }> = {
  ka: { title: 'დამატება და ხელსაწყოები', close: 'დახურვა', photos: 'ფოტოები', video: 'ვიდეო', camera: 'კამერა', files: 'ფაილები', tools: 'ხელსაწყოები', more: 'მეტი' },
  en: { title: 'Add and tools', close: 'Close', photos: 'Photos', video: 'Video', camera: 'Camera', files: 'Files', tools: 'Tools', more: 'More' },
  ru: { title: 'Добавить и инструменты', close: 'Закрыть', photos: 'Фото', video: 'Видео', camera: 'Камера', files: 'Файлы', tools: 'Инструменты', more: 'Ещё' },
};

export function ToolSheet({
  open, onClose, locale, title, tools, studios = [], extras = [], activeId, onTool, onPhotos, onVideo, onCamera, onFiles,
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
  /** Each tile shows only when the active tool can take it — a remix takes a video, not a photo; a studio neither. */
  onPhotos?: () => void;
  /** A video from the library (or one recorded on the spot — the phone's own picker offers both). */
  onVideo?: () => void;
  onCamera?: () => void;
  onFiles?: () => void;
}) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const c = COPY[lang];
  const tile = 'flex min-h-[88px] flex-1 flex-col items-center justify-center gap-2 rounded-2xl bg-app-elevated/70 text-[13px] font-medium text-app-text transition-colors hover:bg-app-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent';
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
      {(onPhotos || onVideo || onCamera || onFiles) && (
        <div className="flex gap-2.5 px-1 pb-3 pt-1">
          {onPhotos && (
            <button type="button" className={tile} onClick={() => { onPhotos(); onClose(); }}>
              <ImageIcon size={22} aria-hidden="true" /> {c.photos}
            </button>
          )}
          {onVideo && (
            <button type="button" className={tile} onClick={() => { onVideo(); onClose(); }}>
              <Video size={22} aria-hidden="true" /> {c.video}
            </button>
          )}
          {onCamera && (
            <button type="button" className={tile} onClick={() => { onCamera(); onClose(); }}>
              <Camera size={22} aria-hidden="true" /> {c.camera}
            </button>
          )}
          {onFiles && (
            <button type="button" className={tile} onClick={() => { onFiles(); onClose(); }}>
              <Paperclip size={22} aria-hidden="true" /> {c.files}
            </button>
          )}
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
