/**
 * Where the site's front doors lead (docs/DESIGN.md §9).
 *
 *   /                 guest → /{lang}              (the CHAT — the product opens on it, like gemini.google.com)
 *                     signed in → /{lang}/dashboard (the same studio, with the account's session)
 *   /{lang}           guest → render the studio     signed in → /{lang}/dashboard
 *   /{lang}/landing   render the marketing landing, for everyone (it moved here when the chat took the home page)
 *
 * "Signed in" is only a cookie PRESENCE check — routing, not security. A stale cookie lands on the dashboard,
 * which shows its own guest state, exactly as a direct visit would. Every other path under /{lang}/… is untouched.
 */
export const SUPPORTED_LOCALES = ['ka', 'en', 'ru'] as const;

/** Supabase SSR stores the session as sb-<project-ref>-auth-token, chunked as .0/.1 when large. */
const AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;

export function hasSessionCookie(cookies: Array<{ name: string; value: string }>): boolean {
  return cookies.some((c) => AUTH_COOKIE.test(c.name) && c.value.length > 0);
}

export type FrontDoor = { redirect: string } | { render: 'studio' | 'landing' } | null;

/** The decision for `/`, `/{lang}` and `/{lang}/landing`; null for every other path (not a front door). */
export function frontDoor(pathname: string, signedIn: boolean, preferredLocale: string): FrontDoor {
  const segments = pathname.split('/').filter(Boolean);
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(preferredLocale) ? preferredLocale : 'ka';
  if (segments.length === 0) return { redirect: signedIn ? `/${locale}/dashboard` : `/${locale}` };
  const [first, second] = segments;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(first!)) return null;
  if (segments.length === 1) return signedIn ? { redirect: `/${first}/dashboard` } : { render: 'studio' };
  if (segments.length === 2 && second === 'landing') return { render: 'landing' };
  return null;
}

/**
 * True on a page that mounts the studio (OmniStudio): `/{lang}/dashboard…` and — since the chat took the home page —
 * `/{lang}` itself. Surfaces that switch a tool IN PLACE (an `omni:set-tool` event) instead of navigating ask this;
 * a check for "/dashboard" alone made every sidebar tap on the home page a navigation away from the chat.
 */
export function isStudioPath(pathname: string | null | undefined): boolean {
  const p = pathname ?? '';
  return p.includes('/dashboard') || /^\/(ka|en|ru)\/?$/.test(p);
}
