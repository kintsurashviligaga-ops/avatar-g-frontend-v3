'use client';

import { useCallback, useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { saveMedia, type SaveOutcome } from '@/lib/media/saveMedia';
import { BTN_SECONDARY, ICON_BTN } from './tokens';

/**
 * THE download button: the one way every service saves a finished file (the owner's PRD, 2026-10-18: one identical
 * Download card everywhere).
 *
 * It never uses `<a href download>`: the browser drops `download` on a cross-origin link, and every result here is a
 * signed storage link, so that tap navigated away to the raw file. lib/media/saveMedia fetches the bytes and saves
 * them, and on an iPhone hands a picture or a clip to the share sheet (the only way into Photos). A file it cannot
 * fetch is opened instead, which beats a button that does nothing.
 *
 * Three looks of the same button:
 *   · 'icon'    a 44 px round button, for a row of result actions;
 *   · 'overlay' the same on dark glass, for a corner of a picture or a video;
 *   · 'pill'    icon and word, where the download is the main action.
 * While the file is fetched the button is busy (aria-busy, disabled), so a second tap does not save it twice.
 */
type Lang = 'ka' | 'en' | 'ru';

const LABEL: Record<Lang, string> = { ka: 'ჩამოტვირთვა', en: 'Download', ru: 'Скачать' };

const OVERLAY_BTN =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm ' +
  'ring-1 ring-white/15 transition-colors hover:bg-black/65 focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-app-accent disabled:opacity-60';

export interface DownloadButtonProps {
  url: string;
  locale: string;
  /** The file's name without its extension; the extension is read from the bytes. */
  name?: string;
  /** The extension when neither the bytes nor the URL tell it ("mp4", "mp3", "png", "glb"). */
  fallbackExt?: string;
  variant?: 'icon' | 'overlay' | 'pill';
  /** Overrides the word ("Download video"). */
  label?: string;
  /** Told how the save ended (downloaded, shared, cancelled, opened), for a caller that shows a note. */
  onOutcome?: (outcome: SaveOutcome) => void;
  className?: string;
  testId?: string;
}

export function DownloadButton({
  url, locale, name, fallbackExt, variant = 'icon', label, onOutcome, className = '', testId = 'download-button',
}: DownloadButtonProps) {
  const lang: Lang = locale === 'en' || locale === 'ru' ? locale : 'ka';
  const text = label || LABEL[lang];
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const save = useCallback(async () => {
    if (inFlight.current || !url) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const out = await saveMedia(url, name || `myavatar-${Date.now()}`, { fallbackExt });
      onOutcome?.(out);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [url, name, fallbackExt, onOutcome]);

  const icon = busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Download size={16} aria-hidden="true" />;
  const base = variant === 'overlay' ? OVERLAY_BTN : variant === 'pill' ? BTN_SECONDARY : ICON_BTN;

  return (
    <button
      type="button"
      onClick={save}
      disabled={busy || !url}
      aria-busy={busy}
      aria-label={variant === 'pill' ? undefined : text}
      title={text}
      data-testid={testId}
      className={`${base} ${className}`}
    >
      {icon}
      {variant === 'pill' && <span>{text}</span>}
    </button>
  );
}
