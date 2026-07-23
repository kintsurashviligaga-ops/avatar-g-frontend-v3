'use client';

import { useEffect } from 'react';

/**
 * Sets <html lang> to the active locale on the client.
 *
 * The root layout renders <html lang="ka"> STATICALLY (reading cookies()/headers() there would force
 * the whole app to no-store, blocking the ISR edge-caching this iteration enables). This tiny client
 * effect corrects the attribute to the real per-page locale after hydration — so screen readers and the
 * browser see the right language — while keeping the server HTML cacheable. Crawlers already get the
 * authoritative language signal from og:locale + the hreflang cluster (localized generateMetadata).
 * Renders nothing.
 */
export default function HtmlLangSync({ locale }: { locale: string }) {
  useEffect(() => {
    try {
      if (locale) document.documentElement.lang = locale;
    } catch {
      /* noop — non-DOM environment */
    }
  }, [locale]);
  return null;
}
