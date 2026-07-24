'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { AlertTriangle, RotateCcw, ArrowLeft } from 'lucide-react';
import { reportError } from '@/lib/observability/report-error';

const messages: Record<string, { title: string; subtitle: string; retry: string; home: string; details: string }> = {
  en: { title: 'Something went wrong',     subtitle: 'An unexpected error happened. We were notified automatically.', retry: 'Try again',     home: 'Back home',  details: 'Error details' },
  ka: { title: 'რაღაც შეცდომა მოხდა',       subtitle: 'მოულოდნელი შეცდომა. ჩვენ ავტომატურად ვიგებთ.',                  retry: 'სცადე თავიდან', home: 'მთავარზე',   details: 'შეცდომის დეტალები' },
  ru: { title: 'Что-то пошло не так',       subtitle: 'Произошла неожиданная ошибка. Мы получили уведомление автоматически.', retry: 'Повторить', home: 'На главную', details: 'Детали ошибки' },
};

/**
 * Locale-scoped error boundary. Catches errors inside [locale] pages
 * without losing the root layout shell. Honest UX — surfaces error
 * digest for support but never the raw stack trace.
 */
export default function LocaleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams();
  const locale = (typeof params?.locale === 'string' ? params.locale : 'ka') as keyof typeof messages;
  const t = messages[locale] ?? messages['ka'];

  useEffect(() => {
    // Report to the unified reporter (structured log + Sentry captureException) so a [locale]-page render
    // crash is actually captured — the localized copy promises "we were notified automatically", and this
    // boundary STOPS the error at the segment (it never bubbles to app/error.tsx's /api/log-error), so
    // without this it was console-only. reportError never throws, so it is safe inside the boundary.
    reportError(error, { surface: 'LocaleErrorBoundary', locale, digest: error.digest });
  }, [error, locale]);

  if (!t) return null;

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <AlertTriangle size={40} className="text-rose-300/80 mx-auto" />
        <div>
          <h2 className="text-xl font-semibold">{t.title}</h2>
          <p className="mt-2 text-sm text-white/60">{t.subtitle}</p>
          {error.digest && (
            <details className="mt-3 text-[11px] text-white/35">
              <summary className="cursor-pointer hover:text-white/55">{t.details}</summary>
              <code className="block mt-1 font-mono">{error.digest}</code>
            </details>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch gap-2 justify-center">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-white text-black text-[14px] font-semibold hover:bg-white/90 transition"
          >
            <RotateCcw size={16} />
            {t.retry}
          </button>
          <a
            href={`/${locale}`}
            className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-full bg-black border border-white/[0.12] text-white text-[14px] font-medium hover:border-white/[0.22] transition"
          >
            <ArrowLeft size={16} />
            {t.home}
          </a>
        </div>
      </div>
    </div>
  );
}
