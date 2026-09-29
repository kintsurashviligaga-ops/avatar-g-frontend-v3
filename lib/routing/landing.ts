/**
 * Where the site's front doors lead (docs/DESIGN.md §9).
 *
 *   /            guest → /{lang}             (the marketing landing)
 *                signed in → /{lang}/dashboard (as before — returning users never see the landing)
 *   /{lang}      guest → render the landing   signed in → /{lang}/dashboard
 *   /{lang}/landing (retired route) → /{lang}
 *
 * "Signed in" is only a cookie PRESENCE check — routing, not security. A stale cookie lands on the dashboard,
 * which shows its own guest state, exactly as a direct visit would. Every path under /{lang}/… is untouched.
 */
export const SUPPORTED_LOCALES = ['ka', 'en', 'ru'] as const;

/** Supabase SSR stores the session as sb-<project-ref>-auth-token, chunked as .0/.1 when large. */
const AUTH_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/;

export function hasSessionCookie(cookies: Array<{ name: string; value: string }>): boolean {
  return cookies.some((c) => AUTH_COOKIE.test(c.name) && c.value.length > 0);
}

export type FrontDoor = { redirect: string } | { render: 'landing' } | null;

/** The decision for `/`, `/{lang}` and `/{lang}/landing`; null for every other path (not a front door). */
export function frontDoor(pathname: string, signedIn: boolean, preferredLocale: string): FrontDoor {
  const segments = pathname.split('/').filter(Boolean);
  const locale = (SUPPORTED_LOCALES as readonly string[]).includes(preferredLocale) ? preferredLocale : 'ka';
  if (segments.length === 0) return { redirect: signedIn ? `/${locale}/dashboard` : `/${locale}` };
  const [first, second] = segments;
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(first!)) return null;
  if (segments.length === 1) return signedIn ? { redirect: `/${first}/dashboard` } : { render: 'landing' };
  if (segments.length === 2 && second === 'landing') return { redirect: `/${first}` };
  return null;
}
