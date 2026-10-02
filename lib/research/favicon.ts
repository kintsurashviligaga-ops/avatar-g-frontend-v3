/**
 * lib/research/favicon.ts — the rules of the first-party favicon proxy (app/api/research/favicon). Pure.
 *
 * WHY A PROXY: components/chat/SourcesChips deliberately draws NO favicons — an <img> to a favicon service tells that third
 * party which pages the user's answer cited. A research report lists dozens of sources and the owner asked for favicons, so
 * the browser asks OUR route instead: the user's IP and the cited domains never go to a third party from their device (Google
 * already knows the domains — its agent just searched them), and the UI falls back to a letter badge whenever the proxy
 * answers 204. The proxy's own surface is tiny and fixed: ONE upstream host, a validated hostname as its only input, an image
 * allowlist and a size cap — there is nothing here a caller can steer to an internal address.
 */

/** A public DNS name: labels of letters, digits and hyphens, a final alphabetic label. No IPs, no ports, no `localhost`, no paths. */
const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/;

/** The hostname for a favicon request, lower-cased, or null. */
export function validFaviconDomain(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const d = raw.trim().toLowerCase().replace(/^www\./, '');
  if (!HOST_RE.test(d)) return null;
  if (/(^|\.)(localhost|local|internal|test|invalid|example|lan|home|corp|intranet)$/.test(d)) return null;
  return d;
}

/** The single upstream (Google's public favicon service) — constant, never built from input beyond the validated host. */
export const FAVICON_UPSTREAM = 'https://www.google.com/s2/favicons';

/** Where a redirect from the upstream may lead: Google's own image hosts, https only. */
export function isAllowedFaviconRedirect(location: string, base: string): boolean {
  try {
    const u = new URL(location, base);
    return u.protocol === 'https:' && (/^t[0-3]\.gstatic\.com$/.test(u.hostname) || /(^|\.)googleusercontent\.com$/.test(u.hostname));
  } catch {
    return false;
  }
}

export const FAVICON_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon']);
export const FAVICON_MAX_BYTES = 64 * 1024;
