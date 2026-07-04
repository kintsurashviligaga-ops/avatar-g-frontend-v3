/**
 * Open-redirect guard for post-login `redirect` / `next` params (the /login + /auth pages
 * AND the OAuth /auth/callback route). Returns a SAME-ORIGIN absolute path, or `fallback` —
 * never an off-origin target and never a raw control character.
 *
 * Robustness: the input is resolved with the WHATWG URL parser against a fixed internal base,
 * EXACTLY as a browser resolves a `Location:` header, so every off-origin trick collapses to
 * an origin mismatch → fallback:
 *   '//evil.com', '/\\evil.com'        → protocol-relative → off-origin
 *   'https://evil.com'                 → absolute URL      → off-origin
 *   '/\t/evil.com', '/\r/evil.com'     → the parser STRIPS the tab/CR/LF → '//evil.com' → off-origin
 * The value returned is the NORMALISED pathname+search, so it is also safe to hand straight to
 * `res.setHeader('Location', …)` — a raw CR/LF would otherwise throw Node's ERR_INVALID_CHAR
 * (HTTP 500). `login`/`auth` self-referential targets are rejected too, since they would loop
 * the authed short-circuit on the /login page.
 *
 * `.invalid` is a reserved TLD (RFC 2606) so INTERNAL_BASE can never collide with a real origin.
 */
const INTERNAL_BASE = 'http://internal.invalid';

export function safeInternalPath(input: string | null | undefined, fallback: string): string {
  if (!input || typeof input !== 'string') return fallback;
  // Reject ANY C0 control char or DEL (tab/CR/LF/FF/VT/…). The URL parser strips a subset
  // (tab/CR/LF) — the actual open-redirect vector — but the rest would ride through as a
  // percent-encoded same-origin junk path; rejecting all of them keeps the target clean and
  // is defence-in-depth against parser quirks. (Legit redirect paths never contain them.)
  if (/[\x00-\x1f\x7f]/.test(input)) return fallback;
  // Contract: an EXPLICIT absolute path. Rejects 'relative/path' (which new URL would
  // otherwise silently normalise to same-origin) and every external form ('https://…').
  if (!input.startsWith('/')) return fallback;
  let path: string;
  try {
    const u = new URL(input, INTERNAL_BASE);
    if (u.origin !== INTERNAL_BASE) return fallback; // resolved off-origin (protocol-relative / external)
    path = u.pathname + u.search;
  } catch {
    return fallback; // unparseable input
  }
  // pathname from the URL parser always starts with a single '/'; the '//' check is belt-and-braces.
  if (!path.startsWith('/') || path.startsWith('//')) return fallback;
  if (/\/(login|auth)(\/|\?|$)/.test(path)) return fallback; // no auth self-loop
  return path;
}
