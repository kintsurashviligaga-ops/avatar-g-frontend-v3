/**
 * lib/agent/appBuilder/preview.ts — where a built app may be previewed, and with which headers (v5.1 Phase 4, PREPARED,
 * NOT WIRED). Pure.
 *
 * GG 2026-11-13 12:34Z: previews live on a completely separate, isolated domain, never on myavatar.ge's own origin, so a
 * generated app can never read the user's session or cookies.
 *
 * Rule enforced here: the preview host must be HTTPS and on a DIFFERENT registrable domain from the main site. A
 * subdomain such as sandbox.myavatar.ge is refused: it is "same-site" with myavatar.ge, so it receives cookies scoped to
 * .myavatar.ge, SameSite does not protect against it, and it can set ("toss") cookies for the parent domain. A
 * dedicated domain (for example myavatar-apps.ge or a *.usercontent-style domain) has none of these problems. Each app
 * gets its own subdomain on that preview domain (app_xxx.<preview domain>) so two apps cannot read each other either.
 */
export const MAIN_SITE_DOMAIN = 'myavatar.ge';
/** GG 2026-11-13 13:06Z: the preview domain is myavatar-apps.ge. Any other value keeps previews off. */
export const APPROVED_PREVIEW_DOMAIN = 'myavatar-apps.ge';

/** The last two labels, or three for second-level country zones like co.uk / com.ge. Enough for our own domains. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/\.$/, '').split('.');
  const sld = parts.length >= 3 && /^(co|com|org|net|gov|edu|ac)$/.test(parts[parts.length - 2]!) ? 3 : 2;
  return parts.slice(-sld).join('.');
}

export type PreviewDomainCheck = { ok: true; domain: string } | { ok: false; error: string };

/**
 * Check the configured preview domain (env APP_PREVIEW_DOMAIN). Unset, unsafe, or anything other than the approved
 * domain → previews stay off. `approved` is a parameter only so the safety rules below stay testable on their own.
 */
export function checkPreviewDomain(
  raw: string | undefined,
  main: string = MAIN_SITE_DOMAIN,
  approved: string | null = APPROVED_PREVIEW_DOMAIN,
): PreviewDomainCheck {
  const d = (raw ?? '').trim().toLowerCase();
  if (!d) return { ok: false, error: 'no preview domain set; previews stay off' };
  if (!/^(?=.{4,200}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d)) return { ok: false, error: 'not a domain name' };
  if (registrableDomain(d) === registrableDomain(main)) return { ok: false, error: `must not be ${main} or a subdomain of it (a subdomain shares cookies with the main site)` };
  if (/vercel\.app$|github\.io$|netlify\.app$/.test(d)) return { ok: false, error: 'a shared hosting domain; use a domain only we control' };
  if (approved !== null && d !== approved) return { ok: false, error: `only the approved preview domain ${approved} is allowed` };
  return { ok: true, domain: d };
}

/** One origin per app: https://app_abc123.<preview domain>/ (an app id is already lower-case [a-z0-9_]). */
export function previewOrigin(appId: string, domain: string): string | null {
  if (!/^app_[a-z0-9]{6,32}$/.test(appId)) return null;
  return `https://${appId.replace('_', '-')}.${domain}`;
}

/** Origins allowed to show a preview in an iframe: only the main site, so the builder pane can display it. */
export const PREVIEW_FRAME_ANCESTORS = ['https://myavatar.ge', 'https://www.myavatar.ge'] as const;

/**
 * Headers every preview response carries. The app may run its own scripts, but only myavatar.ge may frame it (the
 * builder pane, which also sets iframe sandbox="allow-scripts" without allow-same-origin), it cannot reach the network
 * beyond its own origin, and it never gets a cookie (the preview server sets none).
 */
export function previewHeaders(): Record<string, string> {
  return {
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "form-action 'none'",
      `frame-ancestors ${PREVIEW_FRAME_ANCESTORS.join(' ')}`,
      "base-uri 'none'",
      "object-src 'none'",
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Frame-Options': 'DENY', // old browsers without frame-ancestors: refuse framing entirely (fail closed)
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Cache-Control': 'no-store',
  };
}
