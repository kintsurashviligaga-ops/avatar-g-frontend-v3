/**
 * Which /{locale}/services/<slug> pages the sitemap lists — derived from the service catalog, not a hand-kept list.
 *
 * The sitemap used to hard-code 14 slugs. Some of them (`game`, `tourism`, `voice`) name no catalog service: their
 * pages are copy for things the studio does not run, so the index advertised products that do not exist. A slug is
 * listed only when
 *   1. the catalog maps it to a service a person can use today (LEGACY_SLUG_TO_SERVICE → usableServices: live/beta),
 *   2. it has a real public page — app/[locale]/services/[slug] renders it (lib/services/metadata), otherwise the
 *      page is a noindex "not found", and
 *   3. it is not a redirect source (next.config.js serviceRedirects: `prompt-builder` → `prompt`); a sitemap lists
 *      200 canonicals only. A test checks this set against next.config.js so the two cannot drift.
 */
import { LEGACY_SLUG_TO_SERVICE, usableServices } from '@/lib/catalog/services';
import { getLocalizedMeta } from '@/lib/services/metadata';

/** Service page slugs that permanently redirect to another slug (next.config.js serviceRedirects). */
export const REDIRECTED_SERVICE_SLUGS: ReadonlySet<string> = new Set(['prompt-builder']);

export function sitemapServiceSlugs(): string[] {
  const usable = new Set(usableServices().map((s) => s.id));
  return Object.entries(LEGACY_SLUG_TO_SERVICE)
    .filter(([slug, serviceId]) => usable.has(serviceId) && !REDIRECTED_SERVICE_SLUGS.has(slug) && !!getLocalizedMeta(slug, 'en'))
    .map(([slug]) => slug);
}
