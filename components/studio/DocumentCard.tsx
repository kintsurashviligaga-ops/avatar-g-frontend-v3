'use client';

/**
 * A PDF Agent G wrote, in the chat (Master Task v2.0, Phase 1, DOC-01): its name, its facts, Open, Download and Share.
 * Open shows the file in the browser's own PDF viewer in a new tab; Download saves it under its own name.
 */
import { Download, ExternalLink, FileText, Share2 } from 'lucide-react';
import { documentLinks } from '@/lib/documents/client';

const WORDS = {
  ka: { open: 'ნახვა', download: 'ჩამოტვირთვა', share: 'გაზიარება' },
  en: { open: 'Open', download: 'Download', share: 'Share' },
  ru: { open: 'Открыть', download: 'Скачать', share: 'Поделиться' },
} as const;

export function DocumentCard({ url, path, name, info, locale, onShare }: {
  url: string;
  path?: string;
  name: string;
  info?: string;
  locale: 'ka' | 'en' | 'ru';
  onShare?: () => void;
}) {
  const w = WORDS[locale] ?? WORDS.ka;
  const links = documentLinks({ url, name, ...(path ? { path } : {}) });
  const chip = 'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm transition active:scale-95 sm:min-h-9';
  return (
    <div className="mt-3 w-full max-w-[36rem] rounded-2xl bg-app-elevated p-3 ring-1 ring-app-border/15" data-testid="document-card">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent" aria-hidden="true">
          <FileText size={22} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-app-text" data-testid="document-name">{name}</p>
          {info && <p className="text-xs text-app-muted" data-testid="document-info">{info}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <a href={links.open} target="_blank" rel="noopener noreferrer" data-testid="document-open"
          className={`${chip} bg-app-bg text-app-text ring-1 ring-app-border/15 hover:text-app-accent`}>
          <ExternalLink size={14} aria-hidden="true" /> {w.open}
        </a>
        <a href={links.download} download={name} data-testid="document-download"
          className={`${chip} bg-app-accent text-app-bg shadow-sm hover:opacity-90`}>
          <Download size={14} aria-hidden="true" /> {w.download}
        </a>
        {onShare && (
          <button type="button" onClick={onShare} data-testid="document-share" title={w.share} aria-label={w.share}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-app-bg text-app-text ring-1 ring-app-border/15 transition hover:text-app-accent active:scale-90 sm:h-9 sm:w-9">
            <Share2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
