'use client';

/**
 * The attachments of the message being written, inside the composer pill: a thumbnail for a photo or video,
 * an icon card with the name and size for everything else, a spinner while a file is still being read,
 * downscaled or extracted, and a remove button on each.
 *
 * ⚠️ FILE NAMES WERE LOST. OmniStudio's tray showed every non-media file as the same blank document icon,
 * so two attached PDFs could not be told apart. The name now shows (and is in the remove button's label).
 *
 * The remove button is drawn at 20 px but its hit area is 44 px (the `before:` inset), the touch minimum.
 */

import { memo } from 'react';
import { FileText, Loader2, Music2, Paperclip, X } from 'lucide-react';
import { formatBytes, type Attachment } from './useAttachments';

type Lang = 'ka' | 'en' | 'ru';

export interface AttachmentChipLabels {
  /** The list's accessible name. */
  list: string;
  /** Prefix of each remove button's name: „წაშლა: photo.jpg". */
  remove: string;
  processing: string;
  truncated: string;
}

export const ATTACHMENT_CHIP_LABELS: Readonly<Record<Lang, AttachmentChipLabels>> = Object.freeze({
  ka: { list: 'მიმაგრებული ფაილები', remove: 'წაშლა', processing: 'მუშავდება…', truncated: 'შემოკლებულია' },
  en: { list: 'Attachments', remove: 'Remove', processing: 'Processing…', truncated: 'shortened' },
  ru: { list: 'Вложения', remove: 'Удалить', processing: 'Обработка…', truncated: 'сокращено' },
});

export interface AttachmentChipsProps {
  items: ReadonlyArray<Attachment>;
  onRemove: (id: string) => void;
  locale?: string;
  labels?: Partial<AttachmentChipLabels>;
  className?: string;
}

const kindIcon = (it: Attachment) => (it.kind === 'audio' ? Music2 : it.kind === 'file' ? Paperclip : FileText);

function AttachmentChipsImpl({ items, onRemove, locale, labels, className }: AttachmentChipsProps) {
  if (!items.length) return null;
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const l = { ...ATTACHMENT_CHIP_LABELS[lang], ...(labels ?? {}) };
  return (
    <ul aria-label={l.list} className={`flex flex-wrap gap-2 ${className ?? ''}`}>
      {items.map((it) => {
        const busy = it.status === 'processing';
        const visual = (it.kind === 'image' || it.kind === 'video') && !!it.previewUrl;
        const Icon = kindIcon(it);
        const meta = busy ? l.processing : `${formatBytes(it.size)}${it.truncated ? ` · ${l.truncated}` : ''}`;
        return (
          <li key={it.id} className="relative" aria-busy={busy || undefined} title={it.name}>
            {visual ? (
              <span className="relative block h-14 w-14 overflow-hidden rounded-xl bg-app-surface">
                {it.kind === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.previewUrl} alt={it.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video src={it.previewUrl} aria-label={it.name} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                )}
                {/* Scanline sweep as the thumbnail mounts — the same „processing" cue OmniStudio's tray plays. */}
                <span aria-hidden="true" className="mya-scanline pointer-events-none absolute inset-0" />
              </span>
            ) : (
              <span className="flex h-14 max-w-[220px] items-center gap-2.5 rounded-xl bg-app-surface py-2 pl-2.5 pr-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-app-elevated text-app-accent">
                  {busy ? <Loader2 size={17} aria-hidden="true" className="animate-spin" /> : <Icon size={17} aria-hidden="true" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium leading-tight text-app-text">{it.name}</span>
                  <span className="mt-0.5 block truncate text-[11.5px] leading-tight text-app-muted">{meta}</span>
                </span>
              </span>
            )}
            {visual && busy && (
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-app-bg/50">
                <Loader2 size={18} aria-hidden="true" className="animate-spin text-app-accent" />
              </span>
            )}
            {busy && <span className="sr-only">{l.processing}</span>}
            <button
              type="button"
              onClick={() => onRemove(it.id)}
              aria-label={`${l.remove}: ${it.name}`}
              title={`${l.remove}: ${it.name}`}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 touch-manipulation items-center justify-center rounded-full bg-app-surface text-app-muted shadow ring-1 ring-app-border/15 before:absolute before:-inset-3 before:content-[''] hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-accent"
            >
              <X size={11} aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export const AttachmentChips = memo(AttachmentChipsImpl);
