/**
 * Per-route hreflang + self-canonical for a page's `generateMetadata().alternates` (Iteration 2 —
 * international SEO). MIRRORS app/sitemap.ts `langAlternates` (the verified per-URL cluster) so the in-page
 * HTML signal matches the sitemap instead of inheriting the [locale] layout's homepage-level cluster (which
 * points every sub-page's hreflang at the locale ROOT). Pass the POST-locale path, e.g. '/terms' or
 * '/services/avatar'.
 *
 *   canonical → THIS locale's URL for the path (self-referential — never the locale root).
 *   languages → the same path in every locale + x-default = ka (the primary market).
 *
 * Absolute URLs off the shared SITE_URL SSoT so they match the sitemap + the metadataBase domain exactly.
 */
import { SITE_URL } from './site';

export function localeAlternates(locale: string, path: string): { canonical: string; languages: Record<string, string> } {
  const p = path === '' || path.startsWith('/') ? path : `/${path}`;
  const loc = locale === 'en' || locale === 'ru' ? locale : 'ka';
  return {
    canonical: `${SITE_URL}/${loc}${p}`,
    languages: {
      ka: `${SITE_URL}/ka${p}`,
      en: `${SITE_URL}/en${p}`,
      ru: `${SITE_URL}/ru${p}`,
      'x-default': `${SITE_URL}/ka${p}`,
    },
  };
}
