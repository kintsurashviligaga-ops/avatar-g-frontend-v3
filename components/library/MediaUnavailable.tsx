'use client';

/**
 * What a Library tile shows when its file will not load, instead of the browser's own "Unable to play media" or a
 * broken-image glyph: a plain sentence and, when the list can be fetched again (fresh links), a retry.
 */
import { AlertTriangle, RefreshCw } from 'lucide-react';

type Lang = 'ka' | 'en' | 'ru';

export const MEDIA_UNAVAILABLE_COPY: Record<Lang, { text: string; retry: string }> = {
  ka: { text: 'ფაილი ვერ ჩაიტვირთა.', retry: 'თავიდან ცდა' },
  en: { text: 'This file could not be loaded.', retry: 'Try again' },
  ru: { text: 'Файл не загрузился.', retry: 'Повторить' },
};

export function MediaUnavailable({ lang, onRetry }: { lang: Lang; onRetry?: () => void }) {
  const t = MEDIA_UNAVAILABLE_COPY[lang] ?? MEDIA_UNAVAILABLE_COPY.ka;
  return (
    <div role="status" data-testid="media-unavailable" className="flex h-full w-full flex-col items-center justify-center gap-2 bg-app-bg/80 p-3 text-center">
      <AlertTriangle size={22} aria-hidden="true" className="text-app-muted" />
      <p className="text-[12px] leading-snug text-app-muted">{t.text}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-app-elevated px-3 text-[12px] font-semibold text-app-text transition hover:bg-app-elevated/70"
        >
          <RefreshCw size={13} aria-hidden="true" /> {t.retry}
        </button>
      )}
    </div>
  );
}
