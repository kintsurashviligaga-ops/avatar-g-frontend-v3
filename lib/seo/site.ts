/**
 * Canonical site origin for structured data (Iteration 5). Mirrors the EXACT fallback chain in
 * app/layout.tsx (metadataBaseUrl) so JSON-LD emitted from any page references the SAME @id as the
 * root-layout Organization node — a byte-identical @id makes the graph resolve instead of dangling.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_BASE_URL ||
  process.env.BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  'https://myavatar.ge'
).replace(/\/+$/, ''); // strip trailing slash(es): NEXT_PUBLIC_SITE_URL is set as "https://myavatar.ge/",
// which otherwise doubled the slash in every derived URL/@id (canonical `//en/terms`, `//#organization`).

/** @id of the Organization node the root layout emits once on every page. Reference it, never redefine. */
export const ORG_ID = `${SITE_URL}/#organization`;

/** Real, publishable business contact (from app/[locale]/support + contact pages). */
export const SUPPORT_EMAIL = 'support@myavatar.ge';
