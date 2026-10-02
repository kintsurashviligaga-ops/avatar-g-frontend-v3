import { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * Dynamic sitemap. Every entry MUST be a canonical, 200-returning URL — a
 * sitemap full of redirects or 404s wastes crawl budget and erodes trust.
 *
 * The whole app is locale-prefixed (`/[locale]/…`); the bare `/pricing`,
 * `/dashboard`, … paths all 307-redirect to their `/{locale}/…` form, so we
 * list the redirect *target* (the canonical 200) rather than the redirector.
 * Verified live (2026-06): the 14 service slugs below all 200 — note the slug
 * is `prompt` (not `prompt-builder`, which 308-redirects), and there is NO
 * `/dashboard/billing` route (it 404s), so it is intentionally omitted.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // ⚠️ SITE_URL itself, not a copy of its env chain: this file's hreflang and the pages' own (lib/seo/hreflang.ts,
  // lib/seo/metadata.ts) must agree, and a separate `NEXT_PUBLIC_APP_URL || …` here could name another origin.
  const baseUrl = SITE_URL;
  const now = new Date();
  const locales = ['ka', 'en', 'ru'] as const;

  // ka is the primary market → slightly higher priority than en/ru.
  const localePriority = (locale: string, base: number) =>
    locale === 'ka' ? base : Math.max(0.3, Math.round((base - 0.1) * 10) / 10);

  // Per-URL hreflang (Iteration 2 international SEO). Every entry advertises the SAME path in each
  // locale + x-default=ka, so Google serves the right language per market and the return tags match
  // across the cluster. `path` is the post-locale segment, e.g. '/pricing' or '/services/avatar'.
  const langAlternates = (path: string) => ({
    languages: {
      ka: `${baseUrl}/ka${path}`,
      en: `${baseUrl}/en${path}`,
      ru: `${baseUrl}/ru${path}`,
      'x-default': `${baseUrl}/ka${path}`,
    },
  });

  // The home page, per locale. `/{locale}` renders the studio (it opens on the chat) for every visitor without a
  // session — crawlers included — with the site's home metadata, and is self-canonical. The bare root is NOT listed:
  // it only redirects to the visitor's locale (middleware.ts → lib/routing/landing.ts), and this file lists no
  // redirects. The marketing landing moved to `/{locale}/landing` (200, self-canonical) and is listed beside it.
  const landingPages = locales.flatMap(locale => [
    {
      url: `${baseUrl}/${locale}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: localePriority(locale, 1),
      alternates: langAlternates(''),
    },
    {
      url: `${baseUrl}/${locale}/landing`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: localePriority(locale, 0.9),
      alternates: langAlternates('/landing'),
    },
  ]);

  // Core app / marketing pages, emitted per-locale at their canonical 200 URL.
  const coreSlugs: { slug: string; priority: number; changeFrequency: 'daily' | 'weekly' }[] = [
    { slug: 'pricing', priority: 0.9, changeFrequency: 'weekly' },
    // The /services hub: full per-locale metadata + self-canonical + ItemList JSON-LD, internally linked —
    // was absent while its 14 detail pages were listed. Its own 200 canonical belongs in the index.
    { slug: 'services', priority: 0.85, changeFrequency: 'weekly' },
    { slug: 'dashboard', priority: 0.8, changeFrequency: 'daily' },
    // /chat (the old chat) and /agent were deleted with the old shell on 2026-10-01 — the chat IS the home page now.
  ];
  const corePages = locales.flatMap(locale =>
    coreSlugs.map(({ slug, priority, changeFrequency }) => ({
      url: `${baseUrl}/${locale}/${slug}`,
      lastModified: now,
      changeFrequency,
      priority: localePriority(locale, priority),
      alternates: langAlternates(`/${slug}`),
    }))
  );

  // All 14 core AI service landing pages (dynamic `[slug]` route), per locale.
  const services = [
    'avatar', 'video', 'image', 'music', 'voice',
    'game', 'interior', 'prompt', 'terminal',
    'content-writer', 'podcast', 'character', 'event', 'tourism',
  ];
  const servicePages = locales.flatMap(locale =>
    services.map(service => ({
      url: `${baseUrl}/${locale}/services/${service}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: localePriority(locale, 0.9),
      alternates: langAlternates(`/services/${service}`),
    }))
  );

  // Legal / support — per locale so the App Store can resolve a localized URL. `refund` (not the legacy
  // `refund-policy`, which is a pure redirect) is the 200 canonical, per this file's own no-redirect rule.
  const legalSlugs = ['terms', 'privacy', 'support', 'refund', 'cookies', 'licenses'];
  const legalPages = locales.flatMap(locale =>
    legalSlugs.map(slug => ({
      url: `${baseUrl}/${locale}/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.4,
      alternates: langAlternates(`/${slug}`),
    }))
  );

  return [
    ...landingPages,
    ...corePages,
    ...servicePages,
    ...legalPages,
  ];
}
