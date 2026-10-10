'use client';

/**
 * The second tap a save to Photos sometimes needs (lib/media/saveMedia): iOS opens the share sheet only from a fresh tap,
 * and a large clip can take longer to fetch than the first one lasts. The file is already in memory; this offers it once
 * more, and the tap here opens the sheet with "Save Image" / "Save Video".
 */
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { shareFile } from '@/lib/media/saveMedia';

type Lang = 'ka' | 'en' | 'ru';
const COPY: Record<Lang, { ready: string; save: string; close: string }> = {
  ka: { ready: 'ფაილი მზადაა', save: 'შენახვა Photos-ში', close: 'დახურვა' },
  en: { ready: 'Your file is ready', save: 'Save to Photos', close: 'Close' },
  ru: { ready: 'Файл готов', save: 'Сохранить в Фото', close: 'Закрыть' },
};

export function SaveReadyPrompt({ locale }: { locale: string }) {
  const t = COPY[(locale === 'en' || locale === 'ru' ? locale : 'ka') as Lang];
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const f = (e as CustomEvent<{ file?: File }>).detail?.file;
      if (f) setFile(f);
    };
    window.addEventListener('myavatar:save-ready', on as EventListener);
    return () => window.removeEventListener('myavatar:save-ready', on as EventListener);
  }, []);
  if (!file) return null;
  return (
    <div role="dialog" aria-label={t.ready} data-testid="save-ready"
      className="fixed inset-x-0 bottom-0 z-[80] flex justify-center px-4"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
      <div className="flex w-full max-w-sm items-center gap-2 rounded-2xl border border-app-border/40 bg-app-elevated p-2 pl-4 shadow-xl">
        <span className="min-w-0 flex-1 truncate text-[14px] text-app-text">{t.ready}</span>
        <button type="button" data-testid="save-ready-go"
          onClick={() => { const f = file; setFile(null); void shareFile(f); }}
          className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-app-accent px-4 text-[14px] font-semibold text-app-bg">
          <Download size={16} aria-hidden="true" /> {t.save}
        </button>
        <button type="button" onClick={() => setFile(null)} aria-label={t.close} title={t.close}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-app-muted hover:text-app-text">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
