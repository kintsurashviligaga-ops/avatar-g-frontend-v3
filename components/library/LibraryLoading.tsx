'use client';
/**
 * components/library/LibraryLoading.tsx — the Library while its first page is on the way (Phase 8.14, cold start).
 *
 * It used to be one small spinner in an empty page. After days with the database asleep the first read can take
 * several seconds, and a lone spinner reads as a frozen site. Now: card-shaped placeholders in the grid's own layout
 * at once, and after SLOW_MS a calm line saying the works are still on their way (the request keeps going; the
 * existing failure screen with its Retry button still takes over if it fails).
 */
import { useEffect, useState } from 'react';
import { Skeleton } from '@/components/studio/ui/EmptyState';

export const SLOW_MS = 5000;

const COPY = {
  ka: { loading: 'ბიბლიოთეკა იტვირთება…', slow: 'ნამუშევრები ჯერ კიდევ იტვირთება. პირველ ჯერზე ამას ცოტა მეტი დრო სჭირდება.' },
  en: { loading: 'Loading your library…', slow: 'Your works are still loading. The first visit can take a little longer.' },
  ru: { loading: 'Загружаем библиотеку…', slow: 'Работы ещё загружаются. В первый раз это может занять чуть больше времени.' },
} as const;

export function LibraryLoading({ lang, slowMs = SLOW_MS }: { lang: 'ka' | 'en' | 'ru'; slowMs?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), slowMs);
    return () => window.clearTimeout(id);
  }, [slowMs]);
  const t = COPY[lang];
  return (
    <div role="status" aria-live="polite" data-testid="library-loading">
      <span className="sr-only">{t.loading}</span>
      {slow && (
        <p data-testid="library-loading-slow" className="mb-3 text-center text-[13px] text-app-muted">
          {t.slow}
        </p>
      )}
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-app-border/10 bg-app-elevated">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-1.5 p-2.5">
              <Skeleton className="h-3.5 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
