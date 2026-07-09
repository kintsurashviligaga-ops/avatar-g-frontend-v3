/**
 * lib/security/allowlistedAudioFetch.ts
 * ====================================
 * SSRF-safe fetch for server-side audio retrieval (the photo-to-music-video route). Two guards:
 *   • isAllowedAudioUrl — only HTTPS Supabase-hosted hosts (where our generated tracks live); IP-literal /
 *     loopback / lookalike hosts are rejected.
 *   • fetchAllowlistedAudio — follows redirects MANUALLY, re-validating EVERY hop against the allowlist, so an
 *     allowlisted host that 3xx-redirects to an internal address (metadata/loopback/RFC-1918) is never
 *     followed. A default `fetch` follows redirects transparently, which would make validating only the
 *     initial URL an SSRF hole.
 *
 * Pure + fetch-injectable (no server-only) so the guard + the redirect walk are unit-testable.
 */
export type FetchLike = typeof fetch;

/** True iff `raw` is an HTTPS URL on a Supabase-hosted host (project host or *.supabase.co / *.supabase.in). */
export function isAllowedAudioUrl(raw: string, env: NodeJS.ProcessEnv = process.env): boolean {
  let u: URL;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  // Reject IP-literal / loopback / IPv6-bracket hosts outright.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || host.endsWith('.local') || host.includes(':')) return false;
  let projectHost = '';
  try { projectHost = new URL(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').hostname.toLowerCase(); } catch { /* unset */ }
  if (projectHost && host === projectHost) return true;
  return host.endsWith('.supabase.co') || host.endsWith('.supabase.in');
}

export interface AllowlistedFetchOpts { fetchImpl?: FetchLike; timeoutMs?: number; maxHops?: number; env?: NodeJS.ProcessEnv }

/**
 * Fetch `url`, following up to `maxHops` redirects MANUALLY and re-validating each hop against
 * isAllowedAudioUrl. Returns the first 2xx Response, or null (disallowed host at any hop / no Location on a
 * 3xx / non-2xx terminal / too many redirects / network error). Never transparently follows a redirect.
 */
export async function fetchAllowlistedAudio(url: string, opts: AllowlistedFetchOpts = {}): Promise<Response | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 45_000;
  const maxHops = opts.maxHops ?? 3;
  const env = opts.env ?? process.env;
  let current = url;
  for (let hop = 0; hop < maxHops; hop++) {
    if (!isAllowedAudioUrl(current, env)) return null;
    const res = await fetchImpl(current, { redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if (!res) return null;
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      try { current = new URL(loc, current).toString(); } catch { return null; }
      continue;
    }
    return res.status >= 200 && res.status < 300 ? res : null;
  }
  return null; // too many redirects
}
